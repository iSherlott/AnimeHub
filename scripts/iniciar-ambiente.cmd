@echo off
rem Sobe o site (porta 3000) e os servicos de fundo (portas 4001-4005) se ainda nao estiverem no ar.
rem Pode rodar quantas vezes quiser: o que ja esta de pe e deixado como esta. Logs em logs\site.log e logs\services.log.
rem
rem Para subir sozinho quando voce entrar no Windows (rode UMA vez, num terminal comum):
rem   schtasks /Create /TN "AnimeHub" /SC ONLOGON /DELAY 0001:00 /TR "\"CAMINHO-COMPLETO\scripts\iniciar-ambiente.cmd\""
rem Para remover:
rem   schtasks /Delete /TN "AnimeHub" /F
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs

netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if errorlevel 1 (
  echo Subindo o site na porta 3000...
  start "AnimeHub site" /min cmd /c "npm run dev > logs\site.log 2>&1"
) else (
  echo Site ja esta no ar na porta 3000.
)

netstat -ano | findstr /R /C:":4001 .*LISTENING" >nul
if errorlevel 1 (
  echo Subindo os servicos de fundo...
  start "AnimeHub servicos" /min cmd /c "npm run services > logs\services.log 2>&1"
) else (
  echo Servicos ja estao no ar.
)
endlocal
