from PyInstaller.utils.hooks import collect_submodules

analysis = Analysis(["run.py"], hiddenimports=collect_submodules("uvicorn"))
exe = EXE(PYZ(analysis.pure), analysis.scripts, [], exclude_binaries=True, name="dreamer-backend", upx=False, console=True)
COLLECT(exe, analysis.binaries, analysis.datas, name="dreamer-backend", upx=False)
