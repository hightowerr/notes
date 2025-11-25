import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type OutcomeCardProps = {
  outcome: {
    assembled_text: string;
    state_preference: string | null;
    daily_capacity_hours: number | null;
  };
  title?: string;
  className?: string;
};

export function OutcomeCard({ outcome, title = 'Active Outcome', className }: OutcomeCardProps) {
  const showAttributes = Boolean(outcome.state_preference || outcome.daily_capacity_hours !== null);

  return (
    <div
      className={cn(
        'rounded-xl bg-primary/5 px-4 py-3 shadow-2layer-sm',
        'border-l-4 border-primary',
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</p>
      <p className="mt-2 text-lg font-medium leading-relaxed text-foreground">{outcome.assembled_text}</p>

      {showAttributes && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {outcome.state_preference && (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              State: {outcome.state_preference}
            </Badge>
          )}
          {outcome.daily_capacity_hours !== null && (
            <Badge variant="outline" className="border-primary/30">
              Daily capacity: {outcome.daily_capacity_hours}h/day
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
