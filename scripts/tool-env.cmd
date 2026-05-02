@echo off
set "ORYNVAE_UV=%USERPROFILE%\AppData\Local\Programs\Python\Python312\Scripts\uv.exe"
set "ORYNVAE_NODE=%ProgramFiles%\nodejs\node.exe"
set "ORYNVAE_PNPM=%ProgramFiles%\nodejs\pnpm.cmd"
set "PATH=%USERPROFILE%\AppData\Local\Programs\Python\Python312\Scripts;%ProgramFiles%\nodejs;%PATH%"

if not exist "%ORYNVAE_UV%" (
  echo uv was not found at "%ORYNVAE_UV%"
  exit /b 1
)

if not exist "%ORYNVAE_NODE%" (
  echo node was not found at "%ORYNVAE_NODE%"
  exit /b 1
)

if not exist "%ORYNVAE_PNPM%" (
  echo pnpm was not found at "%ORYNVAE_PNPM%"
  exit /b 1
)

