'use client';

import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { outcomeInputSchema, type OutcomeInput, type OutcomeResponse } from '@/lib/schemas/outcomeSchema';
import { assembleOutcome } from '@/lib/services/outcomeService';
import { useOutcomeDraft } from '@/lib/hooks/useOutcomeDraft';
import { ConfirmReplaceDialog } from './ConfirmReplaceDialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface OutcomeBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialValues?: OutcomeInput | null;
  isEditMode?: boolean;
}

/**
 * OutcomeBuilder - Modal form for creating/editing outcomes
 *
 * Features:
 * - 4-field form: Direction, Object, Metric, Clarifier
 * - Real-time preview using useDeferredValue (<1000ms update)
 * - Client-side validation with Zod
 * - Character limits: 3-100 (object/metric), 3-150 (clarifier)
 * - Toast notifications for success/error
 * - Refresh OutcomeDisplay after successful save
 *
 * @param open - Whether dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param onSuccess - Optional callback after successful save
 * @param initialValues - Initial values for edit mode (null for create mode)
 * @param isEditMode - Whether in edit mode (shows "Update" vs "Set")
 */
export function OutcomeBuilder({ open, onOpenChange, onSuccess, initialValues, isEditMode = false }: OutcomeBuilderProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingData, setPendingData] = useState<OutcomeInput | null>(null);
  const [existingOutcome, setExistingOutcome] = useState<OutcomeResponse | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Draft management hook
  const { draft, hasDraft, saveDraft, clearDraft } = useOutcomeDraft();

  // Form setup with Zod validation
  const form = useForm<OutcomeInput>({
    resolver: zodResolver(outcomeInputSchema),
    defaultValues: initialValues || {
      direction: 'increase',
      object: '',
      metric: '',
      clarifier: '',
      state_preference: undefined,
      daily_capacity_hours: undefined
    }
  });

  // Fetch existing outcome when modal opens (for edit detection)
  useEffect(() => {
    if (open && !isEditMode) {
      // Check if there's an existing outcome
      fetch('/api/outcomes')
        .then(res => res.json())
        .then(data => {
          if (data.outcome) {
            setExistingOutcome(data.outcome);
          } else {
            setExistingOutcome(null);
          }
        })
        .catch(err => {
          console.error('[OutcomeBuilder] Failed to fetch existing outcome:', err);
          setExistingOutcome(null);
        });
    }
  }, [open, isEditMode]);

  // Reset form when initial values change (edit mode)
  useEffect(() => {
    if (initialValues) {
      form.reset(initialValues);
    }
  }, [initialValues, form]);

  // Show draft prompt when modal opens if draft exists
  useEffect(() => {
    if (open && hasDraft && !isEditMode && !initialValues) {
      setShowDraftPrompt(true);
    } else {
      setShowDraftPrompt(false);
    }
  }, [open, hasDraft, isEditMode, initialValues]);

  // Handle draft resume
  const handleResumeDraft = () => {
    if (draft) {
      form.reset({
        direction: draft.direction,
        object: draft.object,
        metric: draft.metric,
        clarifier: draft.clarifier,
        state_preference: draft.state_preference,
        daily_capacity_hours: draft.daily_capacity_hours
      });
      setShowDraftPrompt(false);
      console.log('[Draft] Resumed draft');
    }
  };

  // Handle draft discard
  const handleDiscardDraft = () => {
    clearDraft();
    setShowDraftPrompt(false);
    console.log('[Draft] Discarded draft');
  };

  // Save draft when modal closes (if there's content)
  const handleModalClose = (open: boolean) => {
    if (!open && !isEditMode) {
      // Use setTimeout to ensure React Hook Form has processed all pending field updates
      // This allows the onChange handlers to complete before reading form state
      setTimeout(() => {
        const values = form.getValues();
        console.log('[Draft] Saving draft on modal close:', values);
        saveDraft(values);
      }, 0);
    }
    onOpenChange(open);
  };

  // Watch form values for real-time preview
  const direction = form.watch('direction');
  const object = form.watch('object');
  const metric = form.watch('metric');
  const clarifier = form.watch('clarifier');
  const statePreference = form.watch('state_preference');
  const dailyCapacity = form.watch('daily_capacity_hours');

  // Defer preview updates to avoid blocking typing
  const deferredObject = useDeferredValue(object);
  const deferredMetric = useDeferredValue(metric);
  const deferredClarifier = useDeferredValue(clarifier);

  // Assemble preview text (memoized for performance)
  const previewText = useMemo(() => {
    // Only show preview if all fields have some content
    if (!deferredObject || !deferredMetric || !deferredClarifier) {
      return 'Preview will appear as you fill the form...';
    }

    try {
      const outcomeText = assembleOutcome({
        direction,
        object: deferredObject,
        metric: deferredMetric,
        clarifier: deferredClarifier
      });

      // Add context info if provided
      const contextParts = [];
      if (statePreference) contextParts.push(statePreference);
      if (dailyCapacity) contextParts.push(`${dailyCapacity}h/day`);

      if (contextParts.length > 0) {
        return `${outcomeText} • ${contextParts.join(' • ')}`;
      }

      return outcomeText;
    } catch {
      return 'Invalid input';
    }
  }, [direction, deferredObject, deferredMetric, deferredClarifier, statePreference, dailyCapacity]);

  // Handle form submission (with confirmation if outcome exists)
  const onSubmit = async (data: OutcomeInput) => {
    // If there's an existing outcome and we're NOT in edit mode, show confirmation
    if (existingOutcome && !isEditMode) {
      setPendingData(data);
      setShowConfirmDialog(true);
      return;
    }

    // Otherwise, proceed with save
    await saveOutcome(data);
  };

  // Actual save logic (called after confirmation or directly)
  const saveOutcome = async (data: OutcomeInput) => {
    try {
      setIsSubmitting(true);

      console.log('[OutcomeBuilder] Submitting outcome:', data);

      const response = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to save outcome');
      }

      console.log('[OutcomeBuilder] Outcome saved:', result);

      // Show success toast
      toast.success(result.message || '✅ Outcome saved successfully', {
        description: 'Your outcome has been set.',
        duration: 5000
      });

      // Refresh OutcomeDisplay component
      // @ts-expect-error - global method added by OutcomeDisplay component
      if (typeof window.refreshOutcomeDisplay === 'function') {
        // @ts-expect-error - global method added by OutcomeDisplay component
        window.refreshOutcomeDisplay();
      }

      // Clear draft after successful save
      clearDraft();

      // Reset form and close dialog
      form.reset();
      onOpenChange(false);

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }

    } catch (error) {
      console.error('[OutcomeBuilder] Failed to save outcome:', error);
      toast.error('❌ Failed to save outcome', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle confirmation dialog actions
  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    if (pendingData) {
      await saveOutcome(pendingData);
      setPendingData(null);
    }
  };

  const handleCancel = () => {
    setShowConfirmDialog(false);
    setPendingData(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {isEditMode ? 'Edit Your Outcome Statement' : 'Set Your Outcome Statement'}
            </DialogTitle>
            <DialogDescription>
              Define what you want to achieve. Your outcome drives how actions are prioritized.
            </DialogDescription>
          </DialogHeader>

          {/* Draft Recovery Prompt */}
          {showDraftPrompt && draft && (
            <Alert className="mb-4">
              <AlertDescription className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  You have an unsaved draft from earlier. Would you like to resume editing?
                </span>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleDiscardDraft}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleResumeDraft}
                  >
                    Yes
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            {/* Scrollable Form Fields */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {/* Direction Field */}
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11 md:h-10">
                          <SelectValue placeholder="Select direction" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="increase">Increase</SelectItem>
                        <SelectItem value="decrease">Decrease</SelectItem>
                        <SelectItem value="maintain">Maintain</SelectItem>
                        <SelectItem value="launch">Launch</SelectItem>
                        <SelectItem value="ship">Ship</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Object Field */}
              <FormField
                control={form.control}
                name="object"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Object (what to affect)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., monthly recurring revenue"
                        maxLength={100}
                        className="h-11 md:h-10"
                        enterKeyHint="next"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/100 characters
                    </p>
                  </FormItem>
                )}
              />

              {/* Metric Field */}
              <FormField
                control={form.control}
                name="metric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metric (how much, by when)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 25% within 6 months"
                        maxLength={100}
                        className="h-11 md:h-10"
                        enterKeyHint="next"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/100 characters
                    </p>
                  </FormItem>
                )}
              />

              {/* Clarifier Field */}
              <FormField
                control={form.control}
                name="clarifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clarifier (how to achieve it)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., enterprise customer acquisition"
                        maxLength={150}
                        rows={3}
                        className="min-h-[88px] md:min-h-[72px]"
                        enterKeyHint="done"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/150 characters
                    </p>
                  </FormItem>
                )}
              />

              {/* State Preference Field */}
              <FormField
                control={form.control}
                name="state_preference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What&apos;s your energy level today?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-row gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Energized" id="energized" />
                          <Label htmlFor="energized" className="font-normal cursor-pointer">
                            Energized
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Low energy" id="low-energy" />
                          <Label htmlFor="low-energy" className="font-normal cursor-pointer">
                            Low energy
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Daily Capacity Field */}
              <FormField
                control={form.control}
                name="daily_capacity_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How many hours can you work on this daily?</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 2"
                        min={0.25}
                        max={24}
                        step={0.25}
                        className="h-11 md:h-10"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === '' ? undefined : parseFloat(value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Range: 0.25 to 24 hours (15 minutes to full day)
                    </p>
                  </FormItem>
                )}
              />
            </div>

            {/* Sticky Preview Section */}
            <div className="sticky bottom-0 mt-4 flex-shrink-0 border-t pt-4 bg-background space-y-4 z-10">
              <div className="rounded-lg border bg-muted/50 p-3 sm:p-4">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <p className="text-sm italic text-muted-foreground">
                  {previewText}
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleModalClose(false)}
                  disabled={isSubmitting}
                  className="h-11 md:h-10"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 md:h-10"
                >
                  {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Outcome' : 'Set Outcome Statement')}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Confirmation Dialog */}
    <ConfirmReplaceDialog
      open={showConfirmDialog}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
    </>
  );
}
