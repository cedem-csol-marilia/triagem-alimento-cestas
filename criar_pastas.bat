@echo off
REM ============================================================
REM triagem-alimento-cestas — Criar estrutura de pastas
REM Execute dentro da pasta do projeto:
REM C:\Users\MaríliaGiraudonJeraC\cedem\triagem-alimento-cestas\
REM ============================================================

echo Criando estrutura de pastas...

REM Pastas principais
mkdir app
mkdir app\login
mkdir app\dashboard
mkdir app\triagem
mkdir app\fila
mkdir app\entregas
mkdir app\familias
mkdir components
mkdir components\layout
mkdir lib
mkdir lib\supabase
mkdir styles
mkdir types

echo.
echo Pastas criadas! Agora coloque cada arquivo no lugar certo:
echo.
echo  app\layout.tsx
echo  app\page.tsx
echo  app\login\page.tsx
echo  app\dashboard\layout.tsx
echo  app\dashboard\page.tsx
echo  app\triagem\layout.tsx
echo  app\triagem\page.tsx
echo  app\fila\page.tsx
echo  app\entregas\page.tsx
echo  app\familias\page.tsx
echo  components\layout\Sidebar.tsx
echo  lib\supabase\client.ts
echo  lib\supabase\server.ts
echo  styles\globals.css
echo  types\index.ts
echo  middleware.ts          (raiz do projeto)
echo  next.config.js         (raiz do projeto)
echo  tsconfig.json          (raiz do projeto)
echo  .env.local             (raiz do projeto)
echo  .gitignore             (raiz do projeto)
echo.
echo Depois de copiar tudo, rode: npm run dev
echo ============================================================
pause
