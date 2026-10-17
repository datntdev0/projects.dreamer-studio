import { bootstrapApplication } from '@angular/platform-browser';
import { RootComponent } from './root.component';

bootstrapApplication(RootComponent).catch((error: unknown) => console.error(error));
