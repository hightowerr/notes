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

type StatusFilters = { success: boolean; failed: boolean; skipped: boolean };

type FilterControlsProps = {
  filterState: {
    toolType: string;
    statusFilters: StatusFilters;
    showOnlyFailed: boolean;
  };
  availableTools: string[];
  onToolChange: (toolType: string) => void;
  onStatusChange: (status: keyof StatusFilters, checked: boolean) => void;
  onShowOnlyFailedChange: (checked: boolean) => void;
};

export function FilterControls({
  filterState,
  availableTools,
  onToolChange,
  onStatusChange,
  onShowOnlyFailedChange,
}: FilterControlsProps) {
  const handleStatusChange = (status: keyof StatusFilters, checked: boolean) => {
    if (!checked) {
      const nextStatus = { ...filterState.statusFilters, [status]: checked };
      if (Object.values(nextStatus).every(value => !value)) {
        return;
      }
    }
    onStatusChange(status, checked);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="tool-filter">Tool</Label>
        <Select
          value={filterState.toolType}
          onValueChange={(value) => onToolChange(value)}
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
          onCheckedChange={(checked) => onShowOnlyFailedChange(checked === true)}
        />
        <Label htmlFor="show-only-failed">Show only failed steps</Label>
      </div>
    </div>
  );
}
