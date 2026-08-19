@echo off
REM Dev-server launcher for the Browser-pane preview. node is not on this machine's
REM PATH (see memory note), and `next dev` shells out to `node`, so prepend the
REM Node install dir before handing off to npm. Keeps the preview tooling working
REM without touching the machine's global PATH.
set "PATH=C:\Program Files\nodejs;%PATH%"
call "C:\Program Files\nodejs\npm.cmd" run dev
