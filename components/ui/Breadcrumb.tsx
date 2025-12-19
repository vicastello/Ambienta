
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export type BreadcrumbItem = {
    label: string;
    href?: string;
};

type BreadcrumbProps = {
    items: BreadcrumbItem[];
    className?: string;
};

export function Breadcrumb({ items, className }: BreadcrumbProps) {
    return (
        <nav aria-label="Breadcrumb" className={`flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 ${className || ''}`}>
            <Link href="/dashboard" className="transition-colors hover:text-slate-900 dark:hover:text-white flex items-center">
                <Home className="h-4 w-4" />
                <span className="sr-only">Dashboard</span>
            </Link>
            {items.map((item, index) => (
                <div key={item.label} className="flex items-center space-x-2">
                    <ChevronRight className="h-4 w-4 opacity-50" />
                    {item.href ? (
                        <Link href={item.href} className="transition-colors hover:text-slate-900 dark:hover:text-white">
                            {item.label}
                        </Link>
                    ) : (
                        <span className="font-medium text-slate-900 dark:text-white">{item.label}</span>
                    )}
                </div>
            ))}
        </nav>
    );
}
