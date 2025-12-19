export interface ConfigBackup {
    timestamp: string;
    configs: Record<string, any>;
    label: string;
}

const STORAGE_KEY = 'marketplace_config_backups';
const MAX_BACKUPS = 5;

/**
 * Salva backup da configuração atual no localStorage
 */
export function saveBackup(configs: Record<string, any>, label?: string): void {
    try {
        const backups = getBackups();

        const newBackup: ConfigBackup = {
            timestamp: new Date().toISOString(),
            configs: JSON.parse(JSON.stringify(configs)), // Deep clone
            label: label || `Backup ${new Date().toLocaleString('pt-BR')}`,
        };

        backups.unshift(newBackup);

        // Keep only last N backups
        if (backups.length > MAX_BACKUPS) {
            backups.splice(MAX_BACKUPS);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(backups));
    } catch (error) {
        console.error('Error saving backup:', error);
    }
}

/**
 * Recupera todos os backups salvos
 */
export function getBackups(): ConfigBackup[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error loading backups:', error);
        return [];
    }
}

/**
 * Restaura um backup específico
 */
export function restoreBackup(index: number): Record<string, any> | null {
    const backups = getBackups();
    if (index >= 0 && index < backups.length) {
        return JSON.parse(JSON.stringify(backups[index].configs)); // Deep clone
    }
    return null;
}

/**
 * Recupera o último backup (mais recente)
 */
export function getLastBackup(): ConfigBackup | null {
    const backups = getBackups();
    return backups.length > 0 ? backups[0] : null;
}

/**
 * Remove backup específico
 */
export function deleteBackup(index: number): void {
    try {
        const backups = getBackups();
        if (index >= 0 && index < backups.length) {
            backups.splice(index, 1);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(backups));
        }
    } catch (error) {
        console.error('Error deleting backup:', error);
    }
}

/**
 * Limpa todos os backups
 */
export function clearAllBackups(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Error clearing backups:', error);
    }
}

/**
 * Formata timestamp para exibição
 */
export function formatBackupTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
