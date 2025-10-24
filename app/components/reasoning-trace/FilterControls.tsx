'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const ALL_TOOLS = [
  'semantic-search',
  'detect-dependencies',
  'get-document-context',
  'query-task-graph',
  'cluster-by-similarity',
];

type FilterControlsProps = {
  filterState: {
    toolType: string;
    statusFilters: { success: boolean; failed: boolean; skipped: boolean };
    showOnlyFailed: boolean;
  };
  onFilterChange: (newFilters: Partial<FilterControlsProps['filterState']>) => void;
  availableTools: string[];
};

export function FilterControls({
  filterState,
  onFilterChange,
  availableTools,
}: FilterControlsProps) {
  const handleStatusChange = (status: keyof typeof filterState.statusFilters, checked: boolean) => {
    const newStatusFilters = { ...filterState.statusFilters, [status]: checked };
    // Enforce at least one status is checked
    if (Object.values(newStatusFilters).every(v => !v)) {
      return;
    }
    onFilterChange({ statusFilters: newStatusFilters });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="tool-filter">Tool</Label>
        <Select
          value={filterState.toolType}
          onValueChange={(value) => onFilterChange({ toolType: value })}
        >
          <SelectTrigger id="tool-filter" className="w-[180px]">
            <SelectValue placeholder="Filter by tool" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tools</SelectItem>
            {ALL_TOOLS.map((tool) => (
              <SelectItem
                key={tool}
                value={tool}
                disabled={!availableTools.includes(tool)}
              >
                {tool} {!availableTools.includes(tool) && '(not used)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <Label>Status</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="status-success"
            checked={filterState.statusFilters.success}
            onCheckedChange={(checked) => handleStatusChange('success', !!checked)}
            disabled={filterState.showOnlyFailed}
          />
          <Label htmlFor="status-success">Success</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="status-failed"
            checked={filterState.statusFilters.failed}
            onCheckedChange={(checked) => handleStatusChange('failed', !!checked)}
            disabled={filterState.showOnlyFailed}
          />
          <Label htmlFor="status-failed">Failed</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="status-skipped"
            checked={filterState.statusFilters.skipped}
            onCheckedChange={(checked) => handleStatusChange('skipped', !!checked)}
            disabled={filterState.showOnlyFailed}
          />
          <Label htmlFor="status-skipped">Skipped</Label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="show-only-failed"
          checked={filterState.showOnlyFailed}
          onCheckedChange={(checked) => onFilterChange({ showOnlyFailed: checked })}
        />
        <Label htmlFor="show-only-failed">Show only failed steps</Label>
      </div>
    </div>
  );
}
