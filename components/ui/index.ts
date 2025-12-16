/**
 * UI Components - Gestor Tiny
 * 
 * Exportações centralizadas de todos os componentes UI reutilizáveis.
 * Importe daqui para melhor organização e DX.
 * 
 * @example
 * ```tsx
 * import { Card, Badge, Input } from '@/components/ui';
 * ```
 */

// Card components
export {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    type CardProps,
    type CardHeaderProps,
    type CardTitleProps,
    type CardDescriptionProps,
    type CardContentProps,
    type CardFooterProps,
    type CardVariant,
    type CardPadding,
} from './Card';

// Badge components
export {
    Badge,
    DotBadge,
    type BadgeProps,
    type DotBadgeProps,
    type BadgeVariant,
    type BadgeSize,
} from './Badge';

// Input components
export {
    Input,
    SearchInput,
    type InputProps,
    type SearchInputProps,
    type InputVariant,
    type InputSize,
} from './Input';

// Chip components
export {
    Chip,
    ChipGroup,
    FilterChip,
    type ChipProps,
    type ChipGroupProps,
    type FilterChipProps,
} from './Chip';

// Button components
export { Button } from './Button';
export type { ButtonProps } from './Button';

// PageHeader component
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

// Existing components
export { GlassCard } from './GlassCard';
export { SectionHeader } from './SectionHeader';
export { Skeleton } from './Skeleton';
export { TrendBadge } from './TrendBadge';
export { Toaster } from './Toaster';
