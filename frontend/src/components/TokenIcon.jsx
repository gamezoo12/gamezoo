import { Coins } from 'lucide-react';
import { cn } from '../lib/utils';

export default function TokenIcon({ className, ...props }) {
  return <Coins className={cn('text-emerald-500', className)} aria-hidden="true" {...props} />;
}
