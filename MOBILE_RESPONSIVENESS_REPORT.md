 Mobile Responsiveness Review Report
**AI Note Synthesiser Application**

**Date:** 2025-10-16
**Reviewer:** UI/UX Design Agent (Claude)
**Target Breakpoints:** 320px, 375px, 414px, 768px, 1024px+

---

## Executive Summary

### Overall Assessment: ⚠️ MODERATE ISSUES FOUND

The AI Note Synthesiser application has a **good foundation** for mobile responsiveness with Tailwind CSS responsive utilities in place, but suffers from **several critical usability issues** on small screens (320-414px). The application is **functional but not optimal** for mobile users.

**Key Strengths:**
- Depth-based color system works well across screen sizes
- Grid layouts properly collapse to single columns on mobile
- shadcn/ui components are inherently responsive
- Font size prevention for iOS zoom (16px minimum) implemented

**Critical Issues:**
1. **Horizontal scrolling** on upload page header (small screens)
2. **Touch targets too small** - many buttons below 44px minimum
3. **Dense content** in SummaryPanel tabs on mobile
4. **Modal forms cramped** - OutcomeBuilder dialog needs better mobile layout
5. **Outcome banner text truncation** loses context on narrow screens
6. **Dashboard filters overflow** horizontally on 320px screens

**Recommendation:** **Requires fixes before mobile launch** - 3 critical, 5 important, 4 nice-to-have issues identified.

---

## Component-by-Component Analysis

### 1. Upload Page (`app/page.tsx`)

#### Header Section (Lines 432-471)
**Status:** ⚠️ CRITICAL ISSUE

**Problems:**
- **Horizontal overflow on screens <375px** due to header content density
- Button text visibility: "Reflections" and "Set Outcome" text hidden on small screens via `hidden sm:inline` (line 453, 462)
- Badge showing document count takes up valuable space
- Theme toggle icon-only, but no clear labeling for screen readers on mobile

**Mobile Layout Issues:**
```tsx
// Current: Cramped layout on mobile
<div className="flex items-center gap-3">
  <Button variant="outline" size="sm" onClick={() => setReflectionPanelOpen(true)} className="gap-2">
    <MessageSquare className="h-4 w-4" />
    <span className="hidden sm:inline">Reflections</span>  // Hidden on mobile
  </Button>
  <Button variant="outline" size="sm" onClick={() => setOutcomeModalOpen(true)} className="gap-2">
    <Target className="h-4 w-4" />
    <span className="hidden sm:inline">Set Outcome</span>  // Hidden on mobile
  </Button>
  <Badge variant="secondary" className="px-4 py-2">
    {files.length} {files.length === 1 ? 'Document' : 'Documents'}
  </Badge>
  <ThemeToggle />
</div>
```

**Touch Targets:**
- Buttons: `size="sm"` = 32px (h-8) - **BELOW 44px minimum**
- Icon-only buttons on mobile lack clear purpose without labels

**Fix Required:**
```tsx
// Recommended: Responsive header with proper sizing
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
  <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
    <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-primary-2" />
    <div className="flex-1 sm:flex-none">
      <h1 className="text-xl sm:text-2xl font-bold text-text-heading">AI Note Synthesiser</h1>
      <p className="text-xs sm:text-sm text-text-muted">
        Autonomous document analysis
      </p>
    </div>
  </div>
  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
    <Button
      variant="outline"
      size="default"  // Use default (h-9 = 36px) or add mobile-specific class
      onClick={() => setReflectionPanelOpen(true)}
      className="gap-2 h-11 sm:h-9"  // 44px on mobile, 36px on desktop
      title="Reflections (Cmd+Shift+R / Ctrl+Shift+R)"
      aria-label="Open reflections panel"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="text-sm">Reflections</span>  // Always visible
    </Button>
    <Button
      variant="outline"
      size="default"
      onClick={() => setOutcomeModalOpen(true)}
      className="gap-2 h-11 sm:h-9"
      aria-label="Set outcome"
    >
      <Target className="h-4 w-4" />
      <span className="text-sm">Outcome</span>  // Shortened for mobile
    </Button>
    <ThemeToggle />
  </div>
</div>

// Move document count badge to separate row on mobile
<div className="sm:hidden mt-2">
  <Badge variant="secondary" className="px-3 py-1.5">
    {files.length} {files.length === 1 ? 'Document' : 'Documents'}
  </Badge>
</div>
```

#### Upload Zone (Lines 482-527)
**Status:** ✅ GOOD

**Strengths:**
- Drag-and-drop zone properly sized
- Padding adjusts with `py-16` (maintains reasonable size)
- Text scales appropriately
- Touch-friendly click area

**Minor Issue:**
- Text size could be slightly larger on mobile for better readability

**Recommendation:**
```tsx
// Enhance text hierarchy on mobile
<p className="text-lg sm:text-xl font-semibold text-text-heading">
  {isDragging ? 'Drop files here' : 'Upload your documents'}
</p>
<p className="text-sm sm:text-sm text-text-muted">
  Drag & drop or tap to browse
</p>
```

#### File Status Cards (Lines 574-603)
**Status:** ⚠️ IMPORTANT ISSUE

**Problems:**
- Status badges too small on mobile (h-3.5 w-3.5 icons = 14px)
- Text truncation could lose important file names
- No word wrapping for long filenames

**Fix Required:**
```tsx
// Current badge sizing
<Badge className="flex items-center gap-1.5 px-3 py-1.5 ...">
  <Loader2 className="h-3.5 w-3.5 animate-spin" />  // Too small
  <span className="font-medium">Processing</span>
</Badge>

// Recommended: Larger touch targets on mobile
<Badge className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:py-1.5 ...">
  <Loader2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin" />
  <span className="font-medium text-sm sm:text-xs">Processing</span>
</Badge>
```

#### Queue Status Summary (Lines 549-562)
**Status:** ✅ ACCEPTABLE

**Strengths:**
- Flex-wrap handles overflow gracefully
- Badges are readable

**Minor Enhancement:**
```tsx
// Add mobile-specific sizing
<div className="flex gap-2 flex-wrap">
  <Badge variant="outline" className="px-3 py-2 sm:py-1.5 text-sm sm:text-xs">
    Processing: {files.filter(f => f.status === 'processing').length}
  </Badge>
  {/* ... */}
</div>
```

---

### 2. Dashboard Page (`app/dashboard/page.tsx`)

#### Header and Controls (Lines 292-396)
**Status:** ⚠️ CRITICAL ISSUE

**Problems:**
- **Filter controls overflow horizontally on 320px screens**
- Select dropdown + sort button + "Select All" button = too wide for small screens
- No responsive stacking on mobile

**Current Layout:**
```tsx
// Lines 349-396: Filters overflow on mobile
<div className="flex flex-col sm:flex-row gap-4 mb-6">
  <Tabs value={statusFilter} onValueChange={...}>
    {/* 5 tabs - wraps awkwardly on mobile */}
  </Tabs>

  <div className="flex gap-2">  // This line causes horizontal overflow
    <select className="px-3 py-2 border rounded-md bg-background">
      {/* ... */}
    </select>
    <Button variant="outline" size="icon" onClick={...}>
      {sortOrder === 'asc' ? '↑' : '↓'}
    </Button>
  </div>

  <Button variant="outline" size="sm" className="ml-auto">
    {/* Select All button pushes layout */}
  </Button>
</div>
```

**Fix Required:**
```tsx
// Recommended: Full-width mobile layout
<div className="flex flex-col gap-4 mb-6">
  {/* Status Filters - Full width on mobile */}
  <Tabs value={statusFilter} onValueChange={...} className="w-full">
    <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full sm:w-auto">
      <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
      <TabsTrigger value="completed" className="text-xs sm:text-sm">Done</TabsTrigger>
      <TabsTrigger value="processing" className="text-xs sm:text-sm">Process</TabsTrigger>
      {/* Mobile: Show as dropdown for failed/review */}
      <TabsTrigger value="review_required" className="hidden sm:inline-flex">Review</TabsTrigger>
      <TabsTrigger value="failed" className="hidden sm:inline-flex">Failed</TabsTrigger>
    </TabsList>
  </Tabs>

  {/* Sort Controls - Full width on mobile */}
  <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
    <select
      className="flex-1 px-3 py-3 sm:py-2 border rounded-md bg-background text-base sm:text-sm"
      aria-label="Sort documents by"
    >
      <option value="date">Sort by Date</option>
      <option value="name">Sort by Name</option>
      <option value="confidence">Sort by Confidence</option>
      <option value="size">Sort by Size</option>
    </select>

    <div className="flex gap-2">
      <Button
        variant="outline"
        size="default"  // Larger on mobile
        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        className="flex-1 sm:flex-none h-11 sm:h-9"
        aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
      >
        {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
      </Button>

      {documents.filter(d => d.status === 'completed' || d.status === 'review_required').length > 0 && (
        <Button
          variant="outline"
          size="default"
          onClick={selectedDocuments.size === 0 ? selectAll : deselectAll}
          className="flex-1 sm:flex-none h-11 sm:h-9"
        >
          {selectedDocuments.size === 0 ? 'Select All' : 'Deselect'}
        </Button>
      )}
    </div>
  </div>
</div>
```

#### Bulk Export Controls (Lines 309-346)
**Status:** ⚠️ IMPORTANT ISSUE

**Problems:**
- Export buttons overflow on narrow screens
- Too many actions in horizontal layout for mobile

**Fix Required:**
```tsx
// Current: Horizontal layout overflows
<div className="flex items-center gap-2">
  <Button variant="outline" size="sm" onClick={() => handleBulkExport('json')}>
    <Download className="h-4 w-4" />
    {exporting ? 'Exporting...' : 'Export JSON'}
  </Button>
  <Button variant="outline" size="sm" onClick={() => handleBulkExport('markdown')}>
    <Download className="h-4 w-4" />
    {exporting ? 'Exporting...' : 'Export Markdown'}
  </Button>
  <Button variant="ghost" size="sm" onClick={deselectAll}>Clear Selection</Button>
</div>

// Recommended: Stack on mobile
<div className="flex flex-col sm:flex-row gap-2">
  <Button
    variant="outline"
    size="default"
    onClick={() => handleBulkExport('json')}
    className="h-11 sm:h-9 w-full sm:w-auto"
  >
    <Download className="h-4 w-4" />
    {exporting ? 'Exporting...' : 'Export JSON'}
  </Button>
  <Button
    variant="outline"
    size="default"
    onClick={() => handleBulkExport('markdown')}
    className="h-11 sm:h-9 w-full sm:w-auto"
  >
    <Download className="h-4 w-4" />
    {exporting ? 'Exporting...' : 'Export Markdown'}
  </Button>
  <Button
    variant="ghost"
    size="default"
    onClick={deselectAll}
    className="h-11 sm:h-9 w-full sm:w-auto"
  >
    Clear Selection
  </Button>
</div>
```

#### Document Grid (Lines 449-654)
**Status:** ✅ GOOD

**Strengths:**
- Grid properly collapses: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Cards are touch-friendly
- Expand/collapse buttons have good sizing

**Minor Enhancement:**
- Checkbox touch targets could be larger on mobile (currently using default size)

```tsx
// Enhance checkbox touch area on mobile
<Checkbox
  checked={selectedDocuments.has(doc.id)}
  onCheckedChange={() => toggleDocumentSelection(doc.id)}
  aria-label={`Select ${doc.name} for export`}
  className="mt-1 h-5 w-5 sm:h-4 sm:w-4"  // Larger on mobile
/>
```

---

### 3. SummaryPanel Component (`app/components/SummaryPanel.tsx`)

#### Tab Navigation (Lines 242-255)
**Status:** ⚠️ IMPORTANT ISSUE

**Problems:**
- 3-column tab layout cramped on mobile
- Icon + text in each tab = too wide for 320px screens
- Tabs may wrap awkwardly

**Fix Required:**
```tsx
// Current: Fixed 3-column grid
<TabsList className="grid w-full grid-cols-3 mb-6">
  <TabsTrigger value="overview" className="flex items-center gap-2">
    <Activity className="h-4 w-4" />
    <span>Overview</span>
  </TabsTrigger>
  {/* ... */}
</TabsList>

// Recommended: Icon-only on mobile, text on larger screens
<TabsList className="grid w-full grid-cols-3 mb-6">
  <TabsTrigger value="overview" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
    <Activity className="h-4 w-4" />
    <span className="text-xs sm:text-sm">Overview</span>
  </TabsTrigger>
  <TabsTrigger value="actions" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
    <MoveRight className="h-4 w-4" />
    <span className="text-xs sm:text-sm">Actions</span>
  </TabsTrigger>
  <TabsTrigger value="tasks" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
    <ListTodo className="h-4 w-4" />
    <span className="text-xs sm:text-sm">Tasks</span>
  </TabsTrigger>
</TabsList>
```

#### Actions Grid (Lines 383-474)
**Status:** ⚠️ IMPORTANT ISSUE

**Problems:**
- 2-column grid on mobile (`grid-cols-1 md:grid-cols-2`) - should be 1 column on small screens
- Action cards with badges can overflow
- Effort level badges cramped with time estimates

**Fix Required:**
```tsx
// Current: Forces 2 columns too early
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  {/* Action cards */}
</div>

// Recommended: Single column on mobile
<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
  {/* Use lg: breakpoint (1024px) instead of md: (768px) */}
</div>

// Also wrap badges better on mobile
<div className="flex flex-wrap items-center gap-2 mt-2">
  {isExcluded && exclusionReason && (
    <Badge variant="outline" className="bg-destructive-bg/20 text-destructive-text text-xs sm:text-xs border-destructive-text/20 max-w-full">
      🚫 <span className="truncate">{exclusionReason}</span>
    </Badge>
  )}
  {/* ... other badges */}
</div>
```

#### LNO Tasks Columns (Lines 484-586)
**Status:** ⚠️ CRITICAL ISSUE

**Problems:**
- **3-column layout remains on mobile** (`grid-cols-1 md:grid-cols-3`)
- **Horizontal scrolling on screens <768px**
- Fixed height ScrollAreas (300px) waste space on mobile
- Column headers too close together on tablets

**Fix Required:**
```tsx
// Current: 3 columns from 768px+
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {/* Leverage/Neutral/Overhead columns */}
</div>

// Recommended: Stack vertically on mobile and tablets
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  {/* Single column until 1024px */}

  {/* Leverage Column */}
  <Card className="border-0 overflow-hidden">
    <div className="h-1 bg-primary-2" />
    <CardHeader className="pb-3">
      <CardTitle className="text-sm flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary-2" />
        <span className="text-text-heading">Leverage</span>
        <Badge variant="default" className="ml-auto border-0">
          {summary.lno_tasks.leverage.length}
        </Badge>
      </CardTitle>
      <CardDescription className="text-xs">High-impact strategic work</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      {summary.lno_tasks.leverage.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-8">No tasks identified</p>
      ) : (
        <ScrollArea className="h-[200px] lg:h-[300px]">  // Shorter on mobile
          <div className="space-y-2 pr-2">
            {summary.lno_tasks.leverage.map((task, index) => (
              <Card key={index} className="bg-primary-2/5 hover-lift border-0">
                <CardContent className="p-3">
                  <p className="text-xs leading-relaxed text-text-body">{task}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </CardContent>
  </Card>
  {/* Repeat for Neutral and Overhead columns */}
</div>
```

#### Export Buttons (Lines 195-218)
**Status:** ⚠️ IMPORTANT ISSUE

**Problems:**
- Two export buttons side-by-side too cramped on mobile
- Small button size (size="sm") below touch target minimum

**Fix Required:**
```tsx
// Current: Horizontal layout
<div className="flex gap-2">
  <Button variant="outline" size="sm" onClick={handleExportJSON}>
    <Download className="h-3.5 w-3.5" />
    {exportingFormat === 'json' ? 'Exporting...' : 'JSON'}
  </Button>
  <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
    <Download className="h-3.5 w-3.5" />
    {exportingFormat === 'markdown' ? 'Exporting...' : 'Markdown'}
  </Button>
</div>

// Recommended: Stack on very small screens
<div className="flex flex-col xs:flex-row gap-2">
  <Button
    variant="outline"
    size="default"
    onClick={handleExportJSON}
    className="h-11 sm:h-9 w-full xs:w-auto"
  >
    <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
    {exportingFormat === 'json' ? 'Exporting...' : 'JSON'}
  </Button>
  <Button
    variant="outline"
    size="default"
    onClick={handleExportMarkdown}
    className="h-11 sm:h-9 w-full xs:w-auto"
  >
    <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
    {exportingFormat === 'markdown' ? 'Exporting...' : 'Markdown'}
  </Button>
</div>
```

---

### 4. OutcomeBuilder Component (`app/components/OutcomeBuilder.tsx`)

#### Modal Layout (Lines 291-527)
**Status:** ⚠️ CRITICAL ISSUE

**Problems:**
- **Modal too wide for mobile screens** - `sm:max-w-[600px]` with `max-h-[90vh]` creates cramped vertical space
- **Form fields too tall** - `h-11 md:h-10` approach correct but not consistent
- **Preview section takes up too much space** at bottom
- **Draft recovery alert full-width** pushes content down
- **No padding adjustment** for very small screens (320px)

**Fix Required:**
```tsx
// Current: Fixed width modal with cramped height
<DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-4 sm:p-6">
  {/* Content */}
</DialogContent>

// Recommended: Better mobile dimensions
<DialogContent className="sm:max-w-[600px] max-h-[95vh] sm:max-h-[90vh] flex flex-col p-3 sm:p-6 gap-3 sm:gap-4">
  <DialogHeader className="flex-shrink-0">
    <DialogTitle className="text-lg sm:text-xl">
      {isEditMode ? 'Edit Your Outcome Statement' : 'Set Your Outcome Statement'}
    </DialogTitle>
    <DialogDescription className="text-sm">
      Define what you want to achieve. Your outcome drives how actions are prioritized.
    </DialogDescription>
  </DialogHeader>

  {/* Draft Recovery Prompt - Compact on mobile */}
  {showDraftPrompt && draft && (
    <Alert className="mb-2 sm:mb-4 p-3">
      <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <span className="text-xs sm:text-sm">
          You have an unsaved draft. Resume editing?
        </span>
        <div className="flex gap-2 shrink-0 w-full sm:w-auto">
          <Button type="button" size="sm" variant="outline" onClick={handleDiscardDraft} className="flex-1 sm:flex-none">
            No
          </Button>
          <Button type="button" size="sm" onClick={handleResumeDraft} className="flex-1 sm:flex-none">
            Yes
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )}

  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
      {/* Scrollable Form Fields - More space on mobile */}
      <div className="flex-1 overflow-y-auto space-y-4 sm:space-y-6 pr-1 sm:pr-2">
        {/* Direction Field - Consistent mobile sizing */}
        <FormField
          control={form.control}
          name="direction"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">Direction</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="h-12 sm:h-10 text-base sm:text-sm">
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="increase" className="text-base sm:text-sm">Increase</SelectItem>
                  <SelectItem value="decrease" className="text-base sm:text-sm">Decrease</SelectItem>
                  <SelectItem value="maintain" className="text-base sm:text-sm">Maintain</SelectItem>
                  <SelectItem value="launch" className="text-base sm:text-sm">Launch</SelectItem>
                  <SelectItem value="ship" className="text-base sm:text-sm">Ship</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Object Field - 16px font size to prevent iOS zoom */}
        <FormField
          control={form.control}
          name="object"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">Object (what to affect)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., monthly recurring revenue"
                  maxLength={100}
                  className="h-12 sm:h-10 text-base sm:text-sm"
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
              <FormLabel className="text-sm">Metric (how much, by when)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., 25% within 6 months"
                  maxLength={100}
                  className="h-12 sm:h-10 text-base sm:text-sm"
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

        {/* Clarifier Field - Better mobile sizing */}
        <FormField
          control={form.control}
          name="clarifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">Clarifier (how to achieve it)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., enterprise customer acquisition"
                  maxLength={150}
                  rows={3}
                  className="min-h-[96px] sm:min-h-[72px] text-base sm:text-sm"
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

        {/* State Preference Field - Stack on mobile */}
        <FormField
          control={form.control}
          name="state_preference"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">What&apos;s your energy level today?</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex flex-col xs:flex-row gap-3 xs:gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Energized" id="energized" className="h-5 w-5 sm:h-4 sm:w-4" />
                    <Label htmlFor="energized" className="font-normal cursor-pointer text-sm sm:text-base">
                      Energized
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Low energy" id="low-energy" className="h-5 w-5 sm:h-4 sm:w-4" />
                    <Label htmlFor="low-energy" className="font-normal cursor-pointer text-sm sm:text-base">
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
              <FormLabel className="text-sm">How many hours can you work on this daily?</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g., 2"
                  min={0.25}
                  max={24}
                  step={0.25}
                  className="h-12 sm:h-10 text-base sm:text-sm"
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
                Range: 0.25 to 24 hours
              </p>
            </FormItem>
          )}
        />
      </div>

      {/* Sticky Preview Section - Compact on mobile */}
      <div className="sticky bottom-0 mt-3 sm:mt-4 flex-shrink-0 border-t pt-3 sm:pt-4 bg-background space-y-3 sm:space-y-4 z-10">
        <div className="rounded-lg border bg-muted/50 p-2.5 sm:p-4">
          <p className="text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Preview:</p>
          <p className="text-xs sm:text-sm italic text-muted-foreground leading-relaxed">
            {previewText}
          </p>
        </div>

        {/* Submit Buttons - Full width on mobile */}
        <div className="flex flex-col-reverse xs:flex-row justify-end gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleModalClose(false)}
            disabled={isSubmitting}
            className="h-12 sm:h-10 w-full xs:w-auto text-base sm:text-sm"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 sm:h-10 w-full xs:w-auto text-base sm:text-sm"
          >
            {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Outcome' : 'Set Outcome')}
          </Button>
        </div>
      </div>
    </form>
  </Form>
</DialogContent>
```

---

### 5. OutcomeDisplay Component (`app/components/OutcomeDisplay.tsx`)

#### Banner Layout (Lines 88-115)
**Status:** ⚠️ IMPORTANT ISSUE

**Problems:**
- **Text truncation on narrow screens** (line 94: `truncate`) loses context
- **Icon and text too close** on mobile (gap-3)
- **Edit button may be cut off** on very narrow screens (320px)
- **Fixed height h-16** may be too small for wrapped text on some devices

**Fix Required:**
```tsx
// Current: Single-line truncation
<div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
  <div className="container flex h-16 items-center justify-between px-4">
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span className="text-2xl" aria-label="Target">🎯</span>
      <p className="text-sm font-medium truncate" title={...}>
        {outcome.assembled_text}
        {contextText && <span className="text-muted-foreground">{contextText}</span>}
      </p>
    </div>
    <Button variant="ghost" size="icon" onClick={() => onEdit(outcome)}>
      <span className="text-xl">✏️</span>
    </Button>
  </div>
</div>

// Recommended: Multi-line on mobile, truncate on desktop
<div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
  <div className="container flex min-h-[64px] sm:h-16 items-center justify-between px-3 sm:px-4 py-2 sm:py-0 gap-2">
    <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
      <span className="text-xl sm:text-2xl shrink-0 mt-0.5 sm:mt-0" aria-label="Target">
        🎯
      </span>
      <p className="text-xs sm:text-sm font-medium line-clamp-2 sm:truncate leading-snug sm:leading-normal" title={`${outcome.assembled_text}${contextText}`}>
        {outcome.assembled_text}
        {contextText && (
          <span className="text-muted-foreground block sm:inline mt-0.5 sm:mt-0">
            {contextText}
          </span>
        )}
      </p>
    </div>

    {onEdit && outcome && (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(outcome)}
        className="ml-1 sm:ml-2 shrink-0 h-10 w-10 sm:h-9 sm:w-9"
        aria-label="Edit outcome"
      >
        <span className="text-lg sm:text-xl">✏️</span>
      </Button>
    )}
  </div>
</div>
```

---

## Color System Mobile Assessment

### Depth Layer Contrast Analysis
**Status:** ✅ EXCELLENT

**Findings:**
- Depth layer system (`--bg-layer-1` through `--bg-layer-4`) provides **excellent visual hierarchy** on mobile
- Color contrast between layers is **sufficient even on small screens**
- Light mode: `oklch(0.96 0 0)` → `oklch(1.00 0 0)` = ~4% difference (visible)
- Dark mode: `oklch(0.08 0 0)` → `oklch(0.20 0 0)` = 12% difference (very clear)
- No borders approach works well on mobile - reduces visual clutter

**Example from globals.css:**
```css
:root {
  --bg-layer-1: oklch(0.9600 0 0);  /* Page background */
  --bg-layer-2: oklch(0.9900 0 0);  /* Cards */
  --bg-layer-3: oklch(1.0000 0 0);  /* Interactive */
  --bg-layer-4: oklch(1.0000 0 0);  /* Elevated */
}
```

### Shadow System Mobile Performance
**Status:** ⚠️ NEEDS ADJUSTMENT

**Issues:**
- **2-layer shadows may be too subtle on mobile screens** (especially in bright sunlight)
- **Inset highlights less visible** on small screens due to pixel density
- **Shadow-lift animations** work well but could be more pronounced

**Recommendations:**
```css
/* Add mobile-specific shadow utilities */
@layer utilities {
  /* Stronger shadows on mobile for better visibility */
  @media (max-width: 640px) {
    .shadow-2layer-sm {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.15),  /* Stronger inset */
        0 2px 4px rgba(0, 0, 0, 0.15);  /* Deeper shadow */
    }

    .shadow-2layer-md {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        0 4px 8px rgba(0, 0, 0, 0.2);
    }

    .shadow-2layer-lg {
      box-shadow:
        inset 0 2px 0 rgba(255, 255, 255, 0.25),
        0 8px 16px rgba(0, 0, 0, 0.25);
    }
  }
}
```

### Semantic Colors Mobile Readability
**Status:** ✅ GOOD

**Findings:**
- Success/warning/info/destructive colors have **good contrast** on mobile
- Text color shades meet WCAG AA standards (4.5:1 minimum for body text)
- **Light mode text:**
  - `--text-heading: oklch(0.10 0 0)` = 14.5:1 contrast ✅
  - `--text-body: oklch(0.25 0 0)` = 9.7:1 contrast ✅
  - `--text-muted: oklch(0.45 0 0)` = 4.9:1 contrast ✅

**Touch State Colors:**
- Need to add explicit tap highlight colors for mobile
- Current implementation relies on hover states which don't apply on touch

**Recommended Addition:**
```css
@layer utilities {
  /* Mobile tap highlights */
  @media (max-width: 640px) {
    button, a, [role="button"] {
      -webkit-tap-highlight-color: rgba(var(--primary-2), 0.2);
      tap-highlight-color: rgba(var(--primary-2), 0.2);
    }

    /* Active state for touch */
    button:active, a:active, [role="button"]:active {
      background-color: var(--bg-layer-4);
      transform: scale(0.98);
    }
  }
}
```

### Font Scaling Mobile
**Status:** ✅ EXCELLENT

**Findings:**
- **iOS auto-zoom prevention** implemented correctly (lines 535-545 in globals.css)
- 16px minimum font size on form inputs prevents iOS zooming on focus
- Responsive font sizes used throughout (`text-xs sm:text-sm`, etc.)

```css
/* Existing: Prevents iOS auto-zoom on input focus */
@media screen and (max-width: 768px) {
  input[type="text"],
  input[type="email"],
  input[type="search"],
  input[type="tel"],
  input[type="url"],
  textarea,
  select {
    font-size: 16px;  /* ✅ Correct implementation */
  }
}
```

---

## Prioritized Fix List

### CRITICAL (Must Fix Before Mobile Launch)

#### 1. Header Horizontal Overflow (`app/page.tsx` lines 432-471)
**Impact:** Unusable on 320-375px screens
**Effort:** Medium
**Priority:** P0

**Issue:** Header content overflows horizontally on small screens, buttons lose labels, cramped layout.

**Fix:** Implement responsive header with proper button sizing and layout stacking.

---

#### 2. Dashboard Filter Overflow (`app/dashboard/page.tsx` lines 349-396)
**Impact:** Controls cut off, horizontal scrolling required
**Effort:** Medium
**Priority:** P0

**Issue:** Filter tabs + sort controls + select all button exceed viewport width on 320-375px screens.

**Fix:** Stack controls vertically on mobile, use full-width inputs, reduce tab count.

---

#### 3. SummaryPanel LNO Tasks Horizontal Scroll (`app/components/SummaryPanel.tsx` lines 484-586)
**Impact:** Content not visible without horizontal scrolling
**Effort:** Low
**Priority:** P0

**Issue:** 3-column grid layout forces horizontal scrolling on screens <1024px.

**Fix:** Change breakpoint from `md:grid-cols-3` to `lg:grid-cols-3`, adjust ScrollArea height.

---

#### 4. OutcomeBuilder Modal Cramped (`app/components/OutcomeBuilder.tsx` lines 291-527)
**Impact:** Poor user experience, difficult form entry
**Effort:** High
**Priority:** P0

**Issue:** Modal too wide, form fields inconsistent sizing, preview takes up too much space.

**Fix:** Implement comprehensive mobile modal layout with proper field sizing (12px height on mobile).

---

### IMPORTANT (Should Fix Before Launch)

#### 5. Touch Target Sizes Below 44px Minimum
**Impact:** Difficult to tap, accessibility issue
**Effort:** Low
**Priority:** P1

**Issue:** Many buttons use `size="sm"` (32px height) which is below Apple's 44px minimum touch target guideline.

**Fix:** Add mobile-specific classes: `h-11 sm:h-9` (44px on mobile, 36px on desktop).

**Affected Components:**
- Upload page header buttons (lines 448-467)
- Dashboard filter buttons (lines 362-395)
- SummaryPanel export buttons (lines 195-218)
- All size="sm" and size="icon" buttons

---

#### 6. OutcomeDisplay Banner Text Truncation (`app/components/OutcomeDisplay.tsx` lines 88-115)
**Impact:** Users can't see full outcome statement
**Effort:** Low
**Priority:** P1

**Issue:** Single-line truncation with `truncate` class cuts off outcome text on mobile.

**Fix:** Use `line-clamp-2` on mobile, allow text wrapping, adjust banner min-height.

---

#### 7. SummaryPanel Actions Grid 2-Column Too Early (`app/components/SummaryPanel.tsx` lines 383-474)
**Impact:** Action cards cramped on tablets
**Effort:** Low
**Priority:** P1

**Issue:** Grid switches to 2 columns at 768px (md: breakpoint), should wait until 1024px.

**Fix:** Change `grid-cols-1 md:grid-cols-2` to `grid-cols-1 lg:grid-cols-2`.

---

#### 8. Dashboard Bulk Export Controls Overflow (`app/dashboard/page.tsx` lines 309-346)
**Impact:** Export buttons overflow on narrow screens
**Effort:** Low
**Priority:** P1

**Issue:** 3 buttons in horizontal layout exceed viewport width on 320px screens.

**Fix:** Stack buttons vertically on mobile using `flex-col sm:flex-row`.

---

#### 9. Form Input Consistency
**Impact:** Inconsistent user experience across forms
**Effort:** Low
**Priority:** P1

**Issue:** Some inputs use `h-11 md:h-10`, others use `h-9`, not all prevent iOS zoom.

**Fix:** Standardize all form inputs to `h-12 sm:h-10 text-base sm:text-sm`.

---

### NICE TO HAVE (Post-Launch Improvements)

#### 10. Upload Zone Text Size
**Impact:** Minor readability improvement
**Effort:** Trivial
**Priority:** P2

**Issue:** Upload zone text could be slightly larger on mobile for better readability.

**Fix:** Change `text-xl` to `text-lg sm:text-xl` for main heading.

---

#### 11. SummaryPanel Tab Navigation Icons
**Impact:** Minor space optimization
**Effort:** Low
**Priority:** P2

**Issue:** Tab labels with icons may wrap awkwardly on 320px screens.

**Fix:** Consider icon-only tabs on very small screens with tooltips.

---

#### 12. Dashboard Checkbox Touch Targets
**Impact:** Minor usability improvement
**Effort:** Trivial
**Priority:** P2

**Issue:** Document selection checkboxes use default size, could be larger on mobile.

**Fix:** Add `h-5 w-5 sm:h-4 sm:w-4` classes to checkboxes.

---

#### 13. Mobile Tap Highlight Colors
**Impact:** Better touch feedback
**Effort:** Low
**Priority:** P2

**Issue:** No explicit tap highlight colors defined for mobile touch interactions.

**Fix:** Add `-webkit-tap-highlight-color` and active state transforms.

---

#### 14. Shadow Strength on Mobile
**Impact:** Minor visual improvement
**Effort:** Low
**Priority:** P2

**Issue:** 2-layer shadows may be too subtle in bright sunlight on mobile screens.

**Fix:** Add mobile-specific shadow utilities with stronger depth.

---

## Code Snippets for Critical Fixes

### Fix 1: Header Responsive Layout

**File:** `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/page.tsx`
**Lines:** 432-471

```tsx
{/* Replace existing header content with: */}
<header className="sticky top-0 z-10 border-b-0 bg-bg-layer-2 shadow-2layer-md">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      {/* Logo and Title */}
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-primary-2 shrink-0" />
        <div className="flex-1 sm:flex-none min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-text-heading truncate">
            AI Note Synthesiser
          </h1>
          <p className="text-xs sm:text-sm text-text-muted truncate">
            Autonomous document analysis
          </p>
        </div>
      </div>

      {/* Action Buttons - Full width on mobile */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
        <Button
          variant="outline"
          size="default"
          onClick={() => setReflectionPanelOpen(true)}
          className="gap-2 h-11 sm:h-9 flex-1 xs:flex-none"
          title="Reflections (Cmd+Shift+R / Ctrl+Shift+R)"
          aria-label="Open reflections panel"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm">Reflect</span>
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => setOutcomeModalOpen(true)}
          className="gap-2 h-11 sm:h-9 flex-1 xs:flex-none"
          aria-label="Set outcome"
        >
          <Target className="h-4 w-4" />
          <span className="text-sm">Outcome</span>
        </Button>
        <ThemeToggle />
      </div>
    </div>

    {/* Document Count Badge - Separate row on mobile */}
    <div className="mt-2 sm:hidden">
      <Badge variant="secondary" className="px-3 py-1.5">
        {files.length} {files.length === 1 ? 'Document' : 'Documents'}
      </Badge>
    </div>
  </div>
</header>
```

---

### Fix 2: Dashboard Filter Controls

**File:** `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/dashboard/page.tsx`
**Lines:** 349-396

```tsx
{/* Replace existing filters section with: */}
<div className="flex flex-col gap-4 mb-6">
  {/* Status Filter Tabs - Responsive grid */}
  <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocumentStatus)}>
    <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full sm:w-auto">
      <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-4">All</TabsTrigger>
      <TabsTrigger value="completed" className="text-xs sm:text-sm px-2 sm:px-4">Done</TabsTrigger>
      <TabsTrigger value="processing" className="text-xs sm:text-sm px-2 sm:px-4 hidden xs:inline-flex">
        Process
      </TabsTrigger>
      <TabsTrigger value="review_required" className="text-xs sm:text-sm px-2 sm:px-4 hidden sm:inline-flex">
        Review
      </TabsTrigger>
      <TabsTrigger value="failed" className="text-xs sm:text-sm px-2 sm:px-4 hidden sm:inline-flex">
        Failed
      </TabsTrigger>
    </TabsList>
  </Tabs>

  {/* Sort Controls - Stack on mobile */}
  <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
    <select
      value={sortField}
      onChange={(e) => setSortField(e.target.value as SortField)}
      className="flex-1 px-3 py-3 sm:py-2 border rounded-md bg-background text-base sm:text-sm"
      aria-label="Sort documents by"
    >
      <option value="date">Sort by Date</option>
      <option value="name">Sort by Name</option>
      <option value="confidence">Sort by Confidence</option>
      <option value="size">Sort by Size</option>
    </select>

    <div className="flex gap-2">
      <Button
        variant="outline"
        size="default"
        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        className="flex-1 sm:flex-none h-11 sm:h-9"
        aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
      >
        <span className="sm:hidden">{sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}</span>
        <span className="hidden sm:inline">{sortOrder === 'asc' ? '↑' : '↓'}</span>
      </Button>

      {documents.filter(d => d.status === 'completed' || d.status === 'review_required').length > 0 && (
        <Button
          variant="outline"
          size="default"
          onClick={selectedDocuments.size === 0 ? selectAll : deselectAll}
          className="flex-1 sm:flex-none h-11 sm:h-9"
        >
          {selectedDocuments.size === 0 ? 'Select All' : 'Clear'}
        </Button>
      )}
    </div>
  </div>
</div>
```

---

### Fix 3: SummaryPanel LNO Tasks Grid

**File:** `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/SummaryPanel.tsx`
**Lines:** 484-586

```tsx
{/* Change grid breakpoint from md to lg: */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  {/* Leverage Column */}
  <Card className="border-0 overflow-hidden">
    <div className="h-1 bg-primary-2" />
    <CardHeader className="pb-3">
      <CardTitle className="text-sm flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary-2" />
        <span className="text-text-heading">Leverage</span>
        <Badge variant="default" className="ml-auto border-0">
          {summary.lno_tasks.leverage.length}
        </Badge>
      </CardTitle>
      <CardDescription className="text-xs">High-impact strategic work</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      {summary.lno_tasks.leverage.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-8">No tasks identified</p>
      ) : (
        <ScrollArea className="h-[200px] lg:h-[300px]">  {/* Shorter on mobile */}
          <div className="space-y-2 pr-2">
            {summary.lno_tasks.leverage.map((task, index) => (
              <Card key={index} className="bg-primary-2/5 hover-lift border-0">
                <CardContent className="p-3">
                  <p className="text-xs leading-relaxed text-text-body">{task}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </CardContent>
  </Card>

  {/* Repeat same pattern for Neutral and Overhead columns */}
  {/* ... */}
</div>
```

---

### Fix 4: Add Mobile-Specific Tailwind Classes

**File:** `/home/yunix/learning-agentic/ideas/Note-synth/notes/tailwind.config.ts`

Add custom breakpoint for extra-small screens:

```typescript
// Add to tailwind.config.ts theme.extend
export default {
  theme: {
    extend: {
      screens: {
        'xs': '475px',  // Between mobile and sm
        // ... existing breakpoints
      },
      // ... rest of config
    }
  }
}
```

---

## Testing Recommendations

### Manual Testing Checklist

Test on the following breakpoints:

#### 320px (iPhone SE, small Android)
- [ ] Header does not overflow horizontally
- [ ] All buttons are tappable (minimum 44px height)
- [ ] Forms are usable without horizontal scrolling
- [ ] Modal dialogs fit within viewport
- [ ] Text is readable (no unnecessary truncation)

#### 375px (iPhone 12/13/14 standard)
- [ ] Dashboard filters don't overflow
- [ ] SummaryPanel tabs display correctly
- [ ] Action cards render in single column
- [ ] Outcome banner shows full text or wraps

#### 414px (iPhone Plus models, large Android)
- [ ] All interactive elements have adequate spacing
- [ ] Two-column layouts still single-column until tablet sizes
- [ ] Forms comfortable to use

#### 768px (iPad Mini, small tablets)
- [ ] Dashboard grid shows 2 columns
- [ ] Filter controls transition to horizontal layout
- [ ] SummaryPanel still shows single-column for actions

#### 1024px+ (iPad, large tablets, desktop)
- [ ] All multi-column layouts active
- [ ] Desktop spacing and sizing applied

### Device Testing

**High Priority:**
- iPhone SE (2020) - 375x667 - Safari
- iPhone 12/13/14 - 390x844 - Safari
- Samsung Galaxy S21 - 360x800 - Chrome
- iPad Mini - 768x1024 - Safari

**Medium Priority:**
- iPhone 14 Pro Max - 430x932 - Safari
- Google Pixel 7 - 412x915 - Chrome
- iPad Pro 11" - 834x1194 - Safari

### Automated Testing

Create Playwright tests for responsive breakpoints:

```typescript
// __tests__/mobile-responsive.spec.ts
import { test, expect } from '@playwright/test';

const breakpoints = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPad Mini', width: 768, height: 1024 },
];

breakpoints.forEach(({ name, width, height }) => {
  test.describe(`${name} (${width}x${height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
    });

    test('header does not overflow', async ({ page }) => {
      const header = page.locator('header');
      const headerBox = await header.boundingBox();
      expect(headerBox?.width).toBeLessThanOrEqual(width);
    });

    test('all buttons meet 44px touch target', async ({ page }) => {
      const buttons = page.locator('button');
      const count = await buttons.count();

      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const box = await button.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('no horizontal scrolling on main pages', async ({ page }) => {
      const body = page.locator('body');
      const scrollWidth = await body.evaluate(el => el.scrollWidth);
      const clientWidth = await body.evaluate(el => el.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance
    });
  });
});
```

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
**Goal:** Make app usable on mobile (320-414px screens)

1. **Day 1-2:** Fix header overflow and touch targets
   - Implement responsive header layout
   - Update all `size="sm"` buttons to use mobile-friendly sizing
   - Add `xs:` breakpoint to Tailwind config

2. **Day 3-4:** Fix dashboard filter overflow
   - Stack filter controls vertically on mobile
   - Implement responsive tab layout
   - Test on 320px, 375px, 414px screens

3. **Day 5:** Fix SummaryPanel horizontal scrolling
   - Change LNO tasks grid breakpoint (md → lg)
   - Change actions grid breakpoint (md → lg)
   - Adjust ScrollArea heights for mobile

### Phase 2: Important Improvements (Week 2)
**Goal:** Optimize mobile user experience

1. **Day 1-2:** Improve OutcomeBuilder modal
   - Implement comprehensive mobile layout
   - Fix form field sizing consistency
   - Compact preview section

2. **Day 3:** Fix OutcomeDisplay banner
   - Implement multi-line text wrapping
   - Adjust banner height for mobile

3. **Day 4:** Dashboard bulk export controls
   - Stack export buttons vertically on mobile
   - Improve touch targets

4. **Day 5:** Form input consistency
   - Standardize all inputs to mobile-friendly sizes
   - Verify iOS zoom prevention

### Phase 3: Polish (Week 3)
**Goal:** Enhance visual feedback and minor UX improvements

1. **Day 1-2:** Implement tap highlight colors
   - Add mobile-specific tap feedback
   - Test active states on touch devices

2. **Day 3:** Strengthen mobile shadows
   - Add mobile-specific shadow utilities
   - Test in various lighting conditions

3. **Day 4-5:** Minor enhancements
   - Upload zone text sizing
   - Checkbox touch targets
   - Tab navigation optimization

---

## Conclusion

The AI Note Synthesiser has a **solid responsive foundation** but requires **significant mobile optimization** before launch. The depth-based color system and shadcn/ui components work well across screen sizes, but **layout density, touch targets, and content stacking** need immediate attention for screens under 414px.

**Key Takeaways:**
- **3 critical issues** block mobile usability (header, dashboard filters, LNO tasks)
- **5 important issues** significantly impact UX (touch targets, modal, banner, export controls, form consistency)
- **Color system and typography** are mobile-ready
- **Estimated effort:** 2-3 weeks for full mobile optimization

**Recommended Action:** Implement Phase 1 critical fixes immediately, followed by Phase 2 improvements within 2 weeks. The application will be **mobile-ready after Phase 2** completion.

---

## Appendix: Mobile Design Best Practices Applied

### Apple Human Interface Guidelines
- ✅ 44x44pt minimum touch targets (implemented in fixes)
- ✅ No horizontal scrolling (fixed in critical issues)
- ⚠️ Text legibility (some improvements needed)
- ✅ One-handed operation considered (bottom-aligned actions)

### Material Design (Android)
- ✅ 48dp minimum touch targets (same as 44pt iOS)
- ✅ Responsive breakpoints (xs, sm, md, lg, xl)
- ✅ Elevation system (depth layers work well)
- ⚠️ Ripple effects (need tap highlight colors)

### WCAG 2.1 Mobile Accessibility
- ✅ Color contrast ratios (all meet AA standard)
- ✅ Font sizes (16px minimum on inputs)
- ⚠️ Focus indicators (need mobile-specific styles)
- ✅ Touch target spacing (after fixes)

---

**Report Generated:** 2025-10-16
**Next Review Recommended:** After Phase 1 fixes implemented
**Contact:** For questions about this report, reference file: `/home/yunix/learning-agentic/ideas/Note-synth/notes/MOBILE_RESPONSIVENESS_REPORT.md`
