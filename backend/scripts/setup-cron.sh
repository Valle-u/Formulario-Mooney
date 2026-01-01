#!/bin/bash

###############################################################################
# Script de Configuración de Tareas Programadas (Cron)
# Para Linux/Unix/MacOS
###############################################################################

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 Configurando tareas programadas (cron)...${NC}"
echo ""

# Obtener ruta absoluta del proyecto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "📁 Directorio del proyecto: $PROJECT_DIR"
echo ""

# Verificar que Node.js esté instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado${NC}"
    echo "Instalar Node.js desde: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✅ Node.js encontrado:${NC} $(node --version)"
echo ""

# Crear archivo cron temporal
CRON_FILE=$(mktemp)

# Agregar cron jobs existentes
crontab -l > "$CRON_FILE" 2>/dev/null || true

# Verificar si ya existe la limpieza en crontab
if grep -q "cleanup-audit-logs.js" "$CRON_FILE"; then
    echo -e "${YELLOW}⚠️  Ya existe una tarea de limpieza configurada${NC}"
    echo ""
    echo "Tareas actuales relacionadas:"
    grep "cleanup-audit-logs.js" "$CRON_FILE"
    echo ""
    read -p "¿Deseas reemplazarla? (s/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        echo "Cancelado."
        rm "$CRON_FILE"
        exit 0
    fi
    # Eliminar entradas antiguas
    grep -v "cleanup-audit-logs.js" "$CRON_FILE" > "${CRON_FILE}.tmp"
    mv "${CRON_FILE}.tmp" "$CRON_FILE"
fi

# Agregar nueva entrada cron
# Ejecutar todos los domingos a las 3 AM
echo "" >> "$CRON_FILE"
echo "# Mooney Maker - Limpieza automática de audit logs" >> "$CRON_FILE"
echo "0 3 * * 0 cd $PROJECT_DIR && node scripts/cleanup-audit-logs.js >> $PROJECT_DIR/logs/cleanup.log 2>&1" >> "$CRON_FILE"

# Crear directorio de logs si no existe
mkdir -p "$PROJECT_DIR/logs"

# Instalar nuevo crontab
crontab "$CRON_FILE"
rm "$CRON_FILE"

echo -e "${GREEN}✅ Tarea programada configurada exitosamente${NC}"
echo ""
echo "📅 Configuración:"
echo "   • Frecuencia: Todos los domingos a las 3:00 AM"
echo "   • Script: scripts/cleanup-audit-logs.js"
echo "   • Logs: logs/cleanup.log"
echo ""
echo "Para ver tareas programadas:"
echo "   crontab -l"
echo ""
echo "Para editar manualmente:"
echo "   crontab -e"
echo ""
echo "Para desactivar:"
echo "   crontab -r"
echo ""

# Probar ejecución en modo dry-run
echo -e "${YELLOW}🧪 Probando ejecución en modo dry-run...${NC}"
echo ""
cd "$PROJECT_DIR" && node scripts/cleanup-audit-logs.js --dry-run

echo ""
echo -e "${GREEN}✅ Configuración completada${NC}"
