#!/bin/bash

# Script de Instalação Rápida - Pack-Man VS Code Extension
# Execute este script para instalar a extensão automaticamente

echo "========================================"
echo "  Pack-Man VS Code Extension Installer  "
echo "========================================"
echo ""

# Verifica se o VS Code está instalado
if ! command -v code &> /dev/null; then
    echo "❌ VS Code não encontrado!"
    echo "   Por favor, instale o VS Code primeiro: https://code.visualstudio.com/"
    exit 1
fi

echo "✅ VS Code encontrado: $(which code)"
echo ""

# Localiza o arquivo VSIX mais recente
VSIX_FILE=$(ls -t pack-man-vscode-*.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ] || [ ! -f "$VSIX_FILE" ]; then
    echo "❌ Arquivo VSIX não encontrado!"
    echo "   Execute 'npm run package' primeiro para criar o arquivo."
    exit 1
fi

echo "✅ Arquivo VSIX encontrado: $VSIX_FILE"
echo ""

# Instala a extensão
echo "📦 Instalando extensão..."
if code --install-extension "$VSIX_FILE" --force; then
    echo ""
    echo "========================================"
    echo "  ✅ Instalação concluída com sucesso!  "
    echo "========================================"
    echo ""
    echo "Próximos passos:"
    echo "1. Recarregue o VS Code (Ctrl+Shift+P > 'Reload Window')"
    echo "2. Abra um projeto com package.json, requirements.txt ou pubspec.yaml"
    echo "3. A extensão ativará automaticamente!"
    echo ""
    echo "Comandos úteis:"
    echo "- Ctrl+Shift+P > 'Pack-Man: Analyze Dependencies'"
    echo "- Ctrl+Shift+P > 'Pack-Man: Show Analysis'"
    echo ""
    echo "📖 Leia INSTALACAO.md para mais informações"
else
    echo ""
    echo "❌ Erro durante a instalação!"
    echo "   Tente instalar manualmente:"
    echo "   1. Abra o VS Code"
    echo "   2. Pressione Ctrl+Shift+P (ou Cmd+Shift+P no Mac)"
    echo "   3. Digite 'Extensions: Install from VSIX...'"
    echo "   4. Selecione o arquivo: $VSIX_FILE"
    exit 1
fi
