import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { EntityType, IssueSeverity, World, WorldEntity } from '@dreamer/shared/models/analysis';
import ForceGraph from 'force-graph';
import { ENTITY_TYPES, entityTypeKeys } from '../omniscient-labels';
import { issueLabelKeys } from '../omniscient-labels';

const NEON_MAX_NODES = 1500;
const NEON_BLUR = 8;
const NEON_BLUR_ACTIVE = 16;
const GRAVITY = 0.14;
const LABEL_ZOOM = 2.6;
const COOLDOWN_TICKS = 150;
const CHARGE_STRENGTH = -120;
const LINK_DISTANCE = 45;
const ZOOM_STEP = 1.3;
const ZOOM_MS = 250;
const FIT_MS = 350;
const FIT_PADDING = 48;
const FIT_MAX_ZOOM = 1.6;
const HOSTILE_PREDICATES = new Set(['enemy_of']);
const HOSTILE_DASH = [3, 2];
const LABEL_POSITION = 0.6;
const ISSUE_RING_GAP = 2;
const ISSUE_RING_WIDTH = 1.5;
const WARNING_RING_DASH = [2, 1.5];

interface GraphNode extends WorldEntity {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  predicate: string;
  text: string;
  issue?: IssueSeverity;
}

interface GravityForce {
  (alpha: number): void;
  initialize: (nodes: GraphNode[]) => void;
}

interface GraphColors {
  background: string;
  link: string;
  linkActive: string;
  label: string;
  labelMuted: string;
  focus: string;
  hostile: string;
  danger: string;
  warning: string;
  types: Record<string, string>;
}

@Component({
  selector: 'ds-world-graph',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './world-graph.component.html',
})
export class WorldGraphComponent implements AfterViewInit, OnDestroy {
  readonly world = input.required<World>();
  readonly selectedId = input<string | null>(null);
  readonly highlightQuery = input<string>('');
  readonly entityTypes = input<EntityType[]>([]);
  readonly predicates = input<string[]>([]);
  readonly predicateOptions = input<string[]>([]);
  readonly predicate = input<string>('all');
  readonly selectEntity = output<string | null>();
  readonly predicateChange = output<string>();

  protected readonly types = ENTITY_TYPES;
  protected readonly typeKeys = entityTypeKeys;
  protected readonly issueKeys = issueLabelKeys;
  protected readonly issueCounts = computed(() => {
    const entities = this.world().entities;
    return {
      errors: entities.filter((entity) => entity.issue === 'error').length,
      warnings: entities.filter((entity) => entity.issue === 'warning').length,
    };
  });
  protected readonly visibleCount = computed(() => {
    const types = this.entityTypes();
    return this.world().entities.filter((entity) => !types.length || (types as string[]).includes(entity.type)).length;
  });

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('graphContainer');
  private readonly zone = inject(NgZone);
  private graph: ForceGraph<GraphNode, GraphLink> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private themeMedia: MediaQueryList | null = null;
  private readonly onThemeMediaChange = (): void => this.readColors();
  private colors: GraphColors = {
    background: 'Canvas',
    link: 'GrayText',
    linkActive: 'CanvasText',
    label: 'CanvasText',
    labelMuted: 'GrayText',
    focus: 'Highlight',
    hostile: 'CanvasText',
    danger: 'CanvasText',
    warning: 'CanvasText',
    types: Object.fromEntries(ENTITY_TYPES.map((type) => [type, 'CanvasText'])) as Record<string, string>,
  };
  private nodes: GraphNode[] = [];
  private links: GraphLink[] = [];
  private neighbours = new Map<string, Set<string>>();
  private degrees = new Map<string, number>();
  private maxDegree = 1;
  private highlighted = new Set<string>();
  private hubIds = new Set<string>();
  private hoveredId: string | null = null;
  private currentSelectedId: string | null = null;
  private pendingFit = false;
  private pendingFocusId: string | null = null;
  private engineStopped = false;
  private fontFamily = 'sans-serif';
  private width = 0;
  private height = 0;

  constructor() {
    effect(() => {
      const world = this.world();
      const entityTypes = this.entityTypes();
      const predicates = this.predicates();
      if (this.graph) untracked(() => this.setData(world, entityTypes, predicates));
    });
    effect(() => {
      const selectedId = this.selectedId();
      const query = this.highlightQuery();
      if (this.graph) this.updateFocus(selectedId, query);
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const element = this.container().nativeElement;
      this.readColors();
      this.graph = new ForceGraph<GraphNode, GraphLink>(element)
        .backgroundColor(this.colors.background)
        .nodeLabel(() => '')
        .nodeCanvasObject((node, context, scale) => this.drawNode(node, context, scale))
        .nodePointerAreaPaint((node, color, context, scale) => {
          if (node.x === undefined || node.y === undefined) return;
          context.fillStyle = color;
          context.beginPath();
          context.arc(node.x, node.y, Math.max(this.radius(node), 5 / scale), 0, Math.PI * 2);
          context.fill();
        })
        .linkColor((link) => this.linkColor(link))
        .linkWidth((link) => (this.isActiveLink(link) ? 1.5 : 0.75))
        .linkLineDash((link) => (link.issue || this.isHostile(link) ? HOSTILE_DASH : null))
        .linkCanvasObjectMode(() => 'after')
        .linkCanvasObject((link, context, scale) => this.drawLinkLabel(link, context, scale))
        .cooldownTicks(COOLDOWN_TICKS)
        .onNodeHover((node) => {
          this.hoveredId = node?.id ?? null;
          element.style.cursor = node ? 'pointer' : '';
          this.redraw();
        })
        .onNodeClick((node) => this.zone.run(() => this.selectEntity.emit(node.id)))
        .onBackgroundClick(() => this.zone.run(() => this.selectEntity.emit(null)))
        .onEngineStop(() => this.onEngineStop());
      this.graph.d3Force('charge')?.['strength'](CHARGE_STRENGTH);
      this.graph.d3Force('link')?.['distance'](LINK_DISTANCE);
      this.graph.d3Force('gravity', this.gravityForce());
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(element);
      this.resize();
      this.themeObserver = new MutationObserver(() => this.readColors());
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      this.themeMedia.addEventListener('change', this.onThemeMediaChange);
      this.setData(this.world(), this.entityTypes(), this.predicates());
      this.updateFocus(this.selectedId(), this.highlightQuery());
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.themeMedia?.removeEventListener('change', this.onThemeMediaChange);
    this.graph?._destructor();
    this.graph = null;
  }

  protected onPredicateChange(event: Event): void {
    this.predicateChange.emit((event.target as HTMLSelectElement).value);
  }

  zoomIn(): void {
    if (this.graph) this.graph.zoom(this.graph.zoom() * ZOOM_STEP, ZOOM_MS);
  }

  zoomOut(): void {
    if (this.graph) this.graph.zoom(this.graph.zoom() / ZOOM_STEP, ZOOM_MS);
  }

  fit(): void {
    if (!this.graph || !this.nodes.length || !this.width || !this.height) return;
    this.pendingFocusId = null;
    this.fitView();
  }

  private fitView(): void {
    this.graph?.zoomToFit(FIT_MS, FIT_PADDING);
    setTimeout(() => {
      if (this.graph && this.graph.zoom() > FIT_MAX_ZOOM) this.graph.zoom(FIT_MAX_ZOOM, ZOOM_MS);
    }, FIT_MS);
  }

  private setData(world: World, entityTypes: EntityType[], predicates: string[]): void {
    const typeFilter = new Set<string>(entityTypes);
    const predicateFilter = new Set(predicates);
    this.nodes = world.entities
      .filter((entity) => !typeFilter.size || typeFilter.has(entity.type))
      .map((entity) => ({ ...entity }));
    const visibleIds = new Set(this.nodes.map((node) => node.id));
    this.links = world.links
      .filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target))
      .filter((link) => !predicateFilter.size || predicateFilter.has(link.predicate))
      .map((link) => ({
        source: link.source,
        target: link.target,
        predicate: link.predicate,
        text: link.label ?? link.predicate,
        issue: link.issue,
      }));
    this.neighbours = new Map(this.nodes.map((node) => [node.id, new Set<string>()]));
    this.degrees = new Map(this.nodes.map((node) => [node.id, 0]));
    for (const link of this.links) {
      const source = this.linkEndId(link.source);
      const target = this.linkEndId(link.target);
      this.neighbours.get(source)?.add(target);
      this.neighbours.get(target)?.add(source);
      this.degrees.set(source, (this.degrees.get(source) ?? 0) + 1);
      this.degrees.set(target, (this.degrees.get(target) ?? 0) + 1);
    }
    this.maxDegree = Math.max(1, ...this.degrees.values());
    const ranked = [...this.nodes].sort((a, b) => this.degree(b) - this.degree(a));
    this.hubIds = new Set(
      ranked
        .filter((node) => this.degree(node) > 1)
        .slice(0, 5)
        .map((node) => node.id),
    );
    this.hoveredId = null;
    this.pendingFit = this.nodes.length > 0;
    this.engineStopped = false;
    this.graph?.graphData({ nodes: this.nodes, links: this.links });
    this.updateFocus(this.selectedId(), this.highlightQuery());
  }

  private updateFocus(selectedId: string | null, query: string): void {
    this.currentSelectedId = selectedId && this.neighbours.has(selectedId) ? selectedId : null;
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? this.nodes.filter((node) =>
          [node.name, ...node.aliases].some((value) => value.toLocaleLowerCase().includes(normalized)),
        )
      : [];
    this.highlighted = new Set(matches.map((node) => node.id));
    this.pendingFocusId = matches[0]?.id ?? null;
    if (this.pendingFocusId && !this.pendingFit) this.focusPending();
    this.redraw();
  }

  private onEngineStop(): void {
    this.engineStopped = true;
    if (this.pendingFit && this.width && this.height) {
      this.pendingFit = false;
      this.fitView();
    }
    this.focusPending();
  }

  private focusPending(): void {
    const node = this.nodes.find((candidate) => candidate.id === this.pendingFocusId);
    if (!node || node.x === undefined || node.y === undefined || !this.graph) return;
    this.pendingFocusId = null;
    this.graph.centerAt(node.x, node.y, FIT_MS);
    this.graph.zoom(Math.max(this.graph.zoom(), 1.5), FIT_MS);
  }

  private resize(): void {
    const element = this.container().nativeElement;
    const width = Math.round(element.clientWidth);
    const height = Math.round(element.clientHeight);
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.graph?.width(width).height(height);
    if (this.pendingFit && this.engineStopped) this.onEngineStop();
  }

  private readColors(): void {
    const style = getComputedStyle(this.container().nativeElement);
    const token = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    const label = token('--color-text', 'CanvasText');
    this.colors = {
      background: token('--color-background', 'Canvas'),
      link: token('--color-border-strong', 'GrayText'),
      linkActive: token('--color-text-secondary', 'CanvasText'),
      label,
      labelMuted: token('--color-text-secondary', 'GrayText'),
      focus: token('--color-focus', 'Highlight'),
      hostile: token('--world-hostile', label),
      danger: token('--color-danger', label),
      warning: token('--color-warning', label),
      types: Object.fromEntries(
        ENTITY_TYPES.map((type) => [type, token(`--color-entity-${type.toLowerCase()}`, label)]),
      ) as Record<string, string>,
    };
    this.fontFamily = token('--font-sans', 'sans-serif');
    this.graph?.backgroundColor(this.colors.background);
    this.redraw();
  }

  private activeId(): string | null {
    return this.hoveredId ?? this.currentSelectedId;
  }

  private drawNode(node: GraphNode, context: CanvasRenderingContext2D, scale: number): void {
    if (node.x === undefined || node.y === undefined) return;
    const activeId = this.activeId();
    const isActive = node.id === activeId;
    const focused = activeId ? isActive || !!this.neighbours.get(activeId)?.has(node.id) : true;
    const matched = this.highlighted.has(node.id);
    const dimmed = activeId ? !focused : this.highlighted.size > 0 && !matched;
    const radius = Math.max(this.radius(node), 3 / scale);
    const color = this.colors.types[node.type] ?? this.colors.label;
    const glow = !dimmed && this.nodes.length <= NEON_MAX_NODES;
    context.save();
    context.globalAlpha = dimmed ? 0.18 : 1;
    if (glow) {
      context.shadowColor = color;
      context.shadowBlur = isActive || matched ? NEON_BLUR_ACTIVE : NEON_BLUR;
    }
    this.circle(context, node.x, node.y, radius);
    context.fillStyle = color;
    context.fill();
    context.shadowBlur = 0;
    if (node.issue) this.drawIssueRing(node, context, radius, scale);
    const showLabel = scale >= LABEL_ZOOM || this.hubIds.has(node.id) || matched || (!!activeId && focused);
    if (showLabel) {
      context.font = `${isActive ? 600 : 400} ${Math.max(10 / scale, 4)}px ${this.fontFamily}`;
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillStyle = this.colors.label;
      context.fillText(node.name, node.x, node.y + radius + 4 / scale);
    }
    context.restore();
  }

  private drawIssueRing(node: GraphNode, context: CanvasRenderingContext2D, radius: number, scale: number): void {
    const error = node.issue === 'error';
    context.beginPath();
    context.arc(node.x ?? 0, node.y ?? 0, radius + ISSUE_RING_GAP / scale, 0, Math.PI * 2);
    context.setLineDash(error ? [] : WARNING_RING_DASH.map((value) => value / scale));
    context.lineWidth = ISSUE_RING_WIDTH / scale;
    context.strokeStyle = error ? this.colors.danger : this.colors.warning;
    context.stroke();
    context.setLineDash([]);
  }

  private circle(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
  }

  private gravityForce(): GravityForce {
    let nodes: GraphNode[] = [];
    const force = (alpha: number): void => {
      for (const node of nodes) {
        const pull = GRAVITY * (1 + this.degree(node) / this.maxDegree) * alpha;
        node.vx = (node.vx ?? 0) - (node.x ?? 0) * pull;
        node.vy = (node.vy ?? 0) - (node.y ?? 0) * pull;
      }
    };
    force.initialize = (items: GraphNode[]): void => {
      nodes = items;
    };
    return force;
  }

  private drawLinkLabel(link: GraphLink, context: CanvasRenderingContext2D, scale: number): void {
    if (!this.isActiveLink(link) || typeof link.source === 'string' || typeof link.target === 'string') return;
    const [from, to] = link.source.id === this.activeId() ? [link.source, link.target] : [link.target, link.source];
    if (from.x === undefined || from.y === undefined || to.x === undefined || to.y === undefined) return;
    const x = from.x + (to.x - from.x) * LABEL_POSITION;
    const y = from.y + (to.y - from.y) * LABEL_POSITION;
    const size = Math.max(9 / scale, 3.5);
    const padding = 2 / scale;
    context.save();
    context.font = `${size}px ${this.fontFamily}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = context.measureText(link.text).width;
    context.fillStyle = this.alphaColor(this.colors.background, 0.85);
    context.fillRect(x - width / 2 - padding, y - size / 2 - padding, width + padding * 2, size + padding * 2);
    context.fillStyle = link.issue || this.isHostile(link) ? this.baseLinkColor(link, false) : this.colors.labelMuted;
    context.fillText(link.text, x, y);
    context.restore();
  }

  private linkColor(link: GraphLink): string {
    const activeId = this.activeId();
    const source = this.linkEndId(link.source);
    const target = this.linkEndId(link.target);
    const connected = this.isActiveLink(link);
    const matched = this.highlighted.has(source) && this.highlighted.has(target);
    const dimmed = activeId ? !connected : this.highlighted.size > 0 && !matched;
    const base = this.baseLinkColor(link, connected);
    return this.alphaColor(base, dimmed ? 0.12 : connected ? 0.95 : 0.7);
  }

  private baseLinkColor(link: GraphLink, connected: boolean): string {
    if (link.issue) return link.issue === 'error' ? this.colors.danger : this.colors.warning;
    if (this.isHostile(link)) return this.colors.hostile;
    return connected ? this.colors.linkActive : this.colors.link;
  }

  private isActiveLink(link: GraphLink): boolean {
    const activeId = this.activeId();
    return !!activeId && (this.linkEndId(link.source) === activeId || this.linkEndId(link.target) === activeId);
  }

  private isHostile(link: GraphLink): boolean {
    return HOSTILE_PREDICATES.has(link.predicate.toLocaleLowerCase());
  }

  private alphaColor(color: string, alpha: number): string {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    if (!hex) return color;
    const value = hex[1];
    return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}, ${alpha})`;
  }

  private radius(node: GraphNode): number {
    return Math.min(10, Math.max(3, 3 + Math.sqrt(this.degree(node)) * 1.8));
  }

  private degree(node: GraphNode): number {
    return this.degrees.get(node.id) ?? node.degree;
  }

  private linkEndId(end: string | GraphNode): string {
    return typeof end === 'string' ? end : end.id;
  }

  private redraw(): void {
    this.graph?.linkColor((link) => this.linkColor(link));
  }
}
