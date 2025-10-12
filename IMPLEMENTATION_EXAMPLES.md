# Implementation Examples - Depth-Based Color Layering

This document provides **copy-paste ready** code examples for migrating from border-heavy design to depth-based color layering.

---

## Table of Contents

1. [Upload Page Components](#1-upload-page-components)
2. [Dashboard Components](#2-dashboard-components)
3. [SummaryPanel Component](#3-summarypanel-component)
4. [OutcomeBuilder Modal](#4-outcomebuilder-modal)
5. [Shared Components](#5-shared-components)
6. [shadcn/ui Component Overrides](#6-shadcnui-component-overrides)

---

## 1. Upload Page Components

### 1.1 Upload Drop Zone Card

**File**: `app/page.tsx` (lines 458-502)

#### Before (Border-Heavy):
```tsx
<Card
  onDragEnter={handleDragEnter}
  onDragLeave={handleDragLeave}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
  className={`relative overflow-hidden cursor-pointer border-2 border-dashed transition-all duration-300 hover-lift ${
    isDragging
      ? 'border-primary bg-primary/10 scale-[1.02]'
      : 'border-border hover:border-primary/50'
  }`}
>
  <div className={`absolute inset-0 gradient-primary-subtle opacity-0 transition-opacity duration-300 ${
    isDragging ? 'opacity-100' : 'group-hover:opacity-50'
  }`} />
  <CardContent className="relative flex flex-col items-center gap-4 py-16 text-center">
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept=".pdf,.docx,.txt,.md"
      onChange={handleFileSelect}
      className="hidden"
      aria-label="File input"
    />
    <div className={`rounded-full bg-primary/10 p-6 transition-transform duration-300 ${
      isDragging ? 'scale-110' : 'scale-100'
    }`}>
      <Upload className={`h-12 w-12 transition-colors duration-300 ${
        isDragging ? 'text-primary' : 'text-primary/60'
      }`} />
    </div>
    <div className="space-y-2">
      <p className="text-xl font-semibold">
        {isDragging ? 'Drop files here' : 'Upload your documents'}
      </p>
      <p className="text-sm text-muted-foreground">
        Drag & drop or click to browse
      </p>
      <p className="text-xs text-muted-foreground">
        Accepts: PDF, DOCX, TXT, MD • Maximum: 10MB
      </p>
    </div>
  </CardContent>
</Card>
```

#### After (Depth-Based):
```tsx
<Card
  onDragEnter={handleDragEnter}
  onDragLeave={handleDragLeave}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
  className={`relative overflow-hidden cursor-pointer border-0 transition-all duration-300 shadow-sm hover:shadow-md ${
    isDragging
      ? 'bg-primary-bg-strong scale-[1.02] shadow-lg'
      : 'bg-bg-2 hover:bg-bg-3'
  }`}
>
  {/* Gradient overlay only when dragging */}
  {isDragging && (
    <div className="absolute inset-0 bg-gradient-to-br from-primary-bg-medium to-accent-bg-medium animate-in fade-in duration-200" />
  )}

  <CardContent className="relative flex flex-col items-center gap-4 py-16 text-center">
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept=".pdf,.docx,.txt,.md"
      onChange={handleFileSelect}
      className="hidden"
      aria-label="File input"
    />

    {/* Icon container with primary tint */}
    <div className={`rounded-full bg-primary-bg-medium p-6 transition-all duration-300 ${
      isDragging
        ? 'scale-110 bg-primary-bg-strong shadow-lg ring-2 ring-primary-2/20'
        : 'scale-100 hover:bg-primary-bg-strong'
    }`}>
      <Upload className="h-12 w-12 text-primary-2 transition-transform duration-300" />
    </div>

    {/* Text content with proper hierarchy */}
    <div className="space-y-2">
      <p className="text-xl font-semibold text-text-primary">
        {isDragging ? 'Drop files here' : 'Upload your documents'}
      </p>
      <p className="text-sm text-text-body">
        Drag & drop or click to browse
      </p>
      <p className="text-xs text-text-caption">
        Accepts: PDF, DOCX, TXT, MD • Maximum: 10MB
      </p>
    </div>
  </CardContent>
</Card>
```

**Key Changes:**
- Removed `border-2 border-dashed border-border`
- Changed `bg-primary/10` to `bg-primary-bg-strong` (semantic variable)
- Added `border-0` explicitly
- Replaced `text-muted-foreground` with `text-text-body` and `text-text-caption`
- Icon uses `text-primary-2` directly (not opacity-based)
- Added `shadow-sm hover:shadow-md` for elevation
- Gradient only renders when dragging (conditional)

---

### 1.2 Empty State Card

**File**: `app/page.tsx` (lines 504-518)

#### Before:
```tsx
<Card className="mt-6 border-dashed overflow-hidden relative">
  <div className="absolute inset-0 gradient-primary-subtle opacity-20" />
  <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
    <div className="rounded-full bg-primary/10 p-8 mb-6">
      <FileText className="h-16 w-16 text-primary/60" />
    </div>
    <p className="text-xl font-semibold mb-2">No documents uploaded yet</p>
    <p className="text-sm text-muted-foreground max-w-md">
      Upload a file above to get started with AI-powered analysis.
      We&apos;ll extract topics, decisions, actions, and categorize tasks automatically.
    </p>
  </CardContent>
</Card>
```

#### After:
```tsx
<Card className="mt-6 border-0 bg-bg-2 overflow-hidden relative shadow-sm">
  <div className="absolute inset-0 bg-gradient-to-br from-primary-bg-subtle to-accent-bg-subtle" />
  <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
    <div className="rounded-full bg-primary-bg-medium p-8 mb-6 shadow-inner">
      <FileText className="h-16 w-16 text-primary-2" />
    </div>
    <p className="text-xl font-semibold mb-2 text-text-primary">No documents uploaded yet</p>
    <p className="text-sm text-text-body max-w-md">
      Upload a file above to get started with AI-powered analysis.
      We&apos;ll extract topics, decisions, actions, and categorize tasks automatically.
    </p>
  </CardContent>
</Card>
```

**Key Changes:**
- Removed `border-dashed`, added `border-0`
- Changed gradient to use semantic variables
- Icon uses `text-primary-2` directly
- Text uses `text-text-primary` and `text-text-body`

---

### 1.3 File List Card

**File**: `app/page.tsx` (lines 550-579)

#### Before:
```tsx
<Card className="transition-all duration-300 hover:shadow-md hover:bg-accent/30 overflow-hidden">
  <CardContent className="flex items-center justify-between p-4">
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="rounded-full bg-primary/10 p-2"
      >
        <FileText className="h-5 w-5 text-primary" />
      </motion.div>
      <div>
        <p className="font-medium">{file.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatFileSize(file.size)} • {formatDate(file.uploadedAt)}
        </p>
        {file.error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-sm text-destructive mt-1"
          >
            {file.error}
          </motion.p>
        )}
      </div>
    </div>
    {getStatusBadge(file.status, file.queuePosition)}
  </CardContent>
</Card>
```

#### After:
```tsx
<Card className="border-0 bg-bg-2 hover:bg-bg-3 transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden">
  <CardContent className="flex items-center justify-between p-4">
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="rounded-full bg-primary-bg-medium p-2"
      >
        <FileText className="h-5 w-5 text-primary-2" />
      </motion.div>
      <div>
        <p className="font-medium text-text-primary">{file.name}</p>
        <p className="text-sm text-text-caption">
          {formatFileSize(file.size)} • {formatDate(file.uploadedAt)}
        </p>
        {file.error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-sm text-destructive-1 mt-1"
          >
            {file.error}
          </motion.p>
        )}
      </div>
    </div>
    {getStatusBadge(file.status, file.queuePosition)}
  </CardContent>
</Card>
```

**Key Changes:**
- Added `border-0`
- Changed `bg-accent/30` to `bg-bg-3` (hover state)
- Icon container uses `bg-primary-bg-medium`
- Text uses semantic color names
- Error text uses `text-destructive-1` (darker shade)

---

### 1.4 Status Badges

**File**: `app/page.tsx` (lines 333-382)

#### Before:
```tsx
const getStatusBadge = (status: FileUploadStatus, queuePosition?: number) => {
  switch (status) {
    case 'uploading':
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5 bg-info/10 text-info border-info/30">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Uploading" />
          <span className="font-medium">Uploading</span>
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/50 text-accent-foreground border-accent/30">
          <Clock className="h-3.5 w-3.5" aria-label="Queued" />
          <span className="font-medium">
            {queuePosition ? `Queued - Position ${queuePosition}` : 'Queued'}
          </span>
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Processing" />
          <span className="font-medium">Processing</span>
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-success-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" aria-label="Complete" />
          <span className="font-medium">Complete</span>
        </Badge>
      );
    case 'review_required':
      return (
        <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 border-warning text-warning">
          <AlertCircle className="h-3.5 w-3.5" aria-label="Review required" />
          <span className="font-medium">Review Required</span>
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="flex items-center gap-1.5 px-3 py-1.5">
          <AlertCircle className="h-3.5 w-3.5" aria-label="Failed" />
          <span className="font-medium">Failed</span>
        </Badge>
      );
    default:
      return <Badge variant="secondary" className="px-3 py-1.5">Unknown</Badge>;
  }
};
```

#### After:
```tsx
const getStatusBadge = (status: FileUploadStatus, queuePosition?: number) => {
  switch (status) {
    case 'uploading':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-info-bg text-info-1 border-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Uploading" />
          <span className="font-medium">Uploading</span>
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-4 text-text-body border-0 shadow-sm">
          <Clock className="h-3.5 w-3.5" aria-label="Queued" />
          <span className="font-medium">
            {queuePosition ? `Queued - Position ${queuePosition}` : 'Queued'}
          </span>
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-bg-strong text-primary-1 border-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Processing" />
          <span className="font-medium">Processing</span>
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-success-bg text-success-1 border-0">
          <CheckCircle2 className="h-3.5 w-3.5" aria-label="Complete" />
          <span className="font-medium">Complete</span>
        </Badge>
      );
    case 'review_required':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-warning-bg text-warning-1 border-0">
          <AlertCircle className="h-3.5 w-3.5" aria-label="Review required" />
          <span className="font-medium">Review Required</span>
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive-bg text-destructive-1 border-0">
          <AlertCircle className="h-3.5 w-3.5" aria-label="Failed" />
          <span className="font-medium">Failed</span>
        </Badge>
      );
    default:
      return <Badge className="px-3 py-1.5 bg-bg-4 text-text-body border-0">Unknown</Badge>;
  }
};
```

**Key Changes:**
- All badges: Added `border-0`
- Replaced inline color classes with semantic variables
- Uploading: `bg-info-bg text-info-1`
- Pending: `bg-bg-4 text-text-body` (neutral)
- Processing: `bg-primary-bg-strong text-primary-1`
- Completed: `bg-success-bg text-success-1`
- Review Required: `bg-warning-bg text-warning-1`
- Failed: `bg-destructive-bg text-destructive-1`

---

## 2. Dashboard Components

### 2.1 Filter Tabs

**File**: `app/dashboard/page.tsx` (lines 350-358)

#### Before:
```tsx
<Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocumentStatus)}>
  <TabsList>
    <TabsTrigger value="all">All</TabsTrigger>
    <TabsTrigger value="completed">Completed</TabsTrigger>
    <TabsTrigger value="processing">Processing</TabsTrigger>
    <TabsTrigger value="review_required">Review Required</TabsTrigger>
    <TabsTrigger value="failed">Failed</TabsTrigger>
  </TabsList>
</Tabs>
```

#### After:
```tsx
<Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocumentStatus)}>
  <TabsList className="bg-bg-2 p-1 gap-1 border-0">
    <TabsTrigger
      value="all"
      className="bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      All
    </TabsTrigger>
    <TabsTrigger
      value="completed"
      className="bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      Completed
    </TabsTrigger>
    <TabsTrigger
      value="processing"
      className="bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      Processing
    </TabsTrigger>
    <TabsTrigger
      value="review_required"
      className="bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      Review Required
    </TabsTrigger>
    <TabsTrigger
      value="failed"
      className="bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      Failed
    </TabsTrigger>
  </TabsList>
</Tabs>
```

**Key Changes:**
- TabsList: Added `bg-bg-2 p-1 gap-1 border-0`
- Active state: `bg-bg-4 text-primary-2 shadow-sm` (elevated layer)
- Inactive state: `bg-transparent text-text-body`
- Added smooth transitions

---

### 2.2 Bulk Export Bar

**File**: `app/dashboard/page.tsx` (lines 308-345)

#### Before:
```tsx
{selectedDocuments.size > 0 && (
  <div className="mb-4 p-4 bg-muted rounded-lg flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <Package className="h-5 w-5 text-primary" />
      <span className="font-medium">{selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected</span>
    </div>
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleBulkExport('json')}
        disabled={exporting}
        className="flex items-center gap-1.5"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting...' : 'Export JSON'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleBulkExport('markdown')}
        disabled={exporting}
        className="flex items-center gap-1.5"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting...' : 'Export Markdown'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={deselectAll}
        disabled={exporting}
      >
        Clear Selection
      </Button>
    </div>
  </div>
)}
```

#### After:
```tsx
{selectedDocuments.size > 0 && (
  <div className="mb-4 p-4 bg-bg-3 rounded-lg flex items-center justify-between gap-4 shadow-sm border-0">
    <div className="flex items-center gap-3">
      <div className="bg-primary-bg-medium rounded-full p-2">
        <Package className="h-5 w-5 text-primary-2" />
      </div>
      <span className="font-medium text-text-primary">
        {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
      </span>
    </div>
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleBulkExport('json')}
        disabled={exporting}
        className="flex items-center gap-1.5 bg-bg-4 hover:bg-primary-bg-subtle hover:text-primary-2 border-0"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting...' : 'Export JSON'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleBulkExport('markdown')}
        disabled={exporting}
        className="flex items-center gap-1.5 bg-bg-4 hover:bg-primary-bg-subtle hover:text-primary-2 border-0"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting...' : 'Export Markdown'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={deselectAll}
        disabled={exporting}
        className="hover:bg-bg-4 text-text-body"
      >
        Clear Selection
      </Button>
    </div>
  </div>
)}
```

**Key Changes:**
- Container: `bg-bg-3 shadow-sm border-0` (elevated layer)
- Icon wrapped in `bg-primary-bg-medium rounded-full p-2`
- Text uses `text-text-primary`
- Buttons: Removed borders, added `bg-bg-4` base with hover tint

---

### 2.3 Document Grid Cards

**File**: `app/dashboard/page.tsx` (lines 454-646)

#### Before:
```tsx
<Card key={doc.id} className="flex flex-col">
  <CardHeader>
    <div className="flex items-start gap-3">
      {/* Checkbox for bulk export */}
      {(doc.status === 'completed' || doc.status === 'review_required') && doc.summary && (
        <Checkbox
          checked={selectedDocuments.has(doc.id)}
          onCheckedChange={() => toggleDocumentSelection(doc.id)}
          aria-label={`Select ${doc.name} for export`}
          className="mt-1"
        />
      )}
      <div className="flex-1">
        <CardTitle className="text-lg truncate" title={doc.name}>
          {doc.name}
        </CardTitle>
        <CardDescription>
          {formatSize(doc.size)} • {formatDate(doc.uploadedAt)}
        </CardDescription>
        <div className="flex gap-2 mt-2">
          <Badge variant={getStatusBadgeVariant(doc.status)}>{doc.status.replace('_', ' ')}</Badge>
          {doc.confidence !== undefined && (
            <Badge variant={getConfidenceBadgeVariant(doc.confidence)}>
              {Math.round(doc.confidence * 100)}% confidence
            </Badge>
          )}
        </div>
      </div>
    </div>
  </CardHeader>

  <CardContent className="flex-1">
    {/* Topics preview */}
    {doc.summary && !isExpanded && (
      <div className="mb-2">
        <p className="text-sm font-semibold mb-1">Topics:</p>
        <div className="flex flex-wrap gap-1">
          {doc.summary.topics.slice(0, 3).map((topic, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {topic}
            </Badge>
          ))}
        </div>
      </div>
    )}
  </CardContent>
</Card>
```

#### After:
```tsx
<Card key={doc.id} className="flex flex-col bg-bg-2 hover:bg-bg-3 transition-all duration-200 shadow-sm hover:shadow-md border-0">
  <CardHeader className="bg-bg-3">
    <div className="flex items-start gap-3">
      {/* Checkbox with hover background */}
      {(doc.status === 'completed' || doc.status === 'review_required') && doc.summary && (
        <div className="hover:bg-bg-4 rounded p-2 -m-2 transition-colors">
          <Checkbox
            checked={selectedDocuments.has(doc.id)}
            onCheckedChange={() => toggleDocumentSelection(doc.id)}
            aria-label={`Select ${doc.name} for export`}
            className="mt-1"
          />
        </div>
      )}
      <div className="flex-1">
        <CardTitle className="text-lg truncate text-text-primary" title={doc.name}>
          {doc.name}
        </CardTitle>
        <CardDescription className="text-text-caption">
          {formatSize(doc.size)} • {formatDate(doc.uploadedAt)}
        </CardDescription>
        <div className="flex gap-2 mt-2">
          {/* Use semantic badge colors */}
          <Badge className={getSemanticBadgeClass(doc.status)}>
            {doc.status.replace('_', ' ')}
          </Badge>
          {doc.confidence !== undefined && (
            <Badge className={getConfidenceBadgeClass(doc.confidence)}>
              {Math.round(doc.confidence * 100)}% confidence
            </Badge>
          )}
        </div>
      </div>
    </div>
  </CardHeader>

  <CardContent className="flex-1 bg-bg-2">
    {/* Topics preview */}
    {doc.summary && !isExpanded && (
      <div className="mb-2">
        <p className="text-sm font-semibold mb-1 text-text-body">Topics:</p>
        <div className="flex flex-wrap gap-1">
          {doc.summary.topics.slice(0, 3).map((topic, idx) => (
            <Badge key={idx} className="text-xs bg-primary-bg-subtle text-primary-1 border-0">
              {topic}
            </Badge>
          ))}
          {doc.summary.topics.length > 3 && (
            <Badge className="text-xs bg-bg-4 text-text-caption border-0">
              +{doc.summary.topics.length - 3} more
            </Badge>
          )}
        </div>
      </div>
    )}
  </CardContent>
</Card>
```

**Helper Functions:**
```tsx
// Add these helper functions to replace getStatusBadgeVariant
const getSemanticBadgeClass = (status: DocumentStatus): string => {
  switch (status) {
    case 'completed':
      return 'bg-success-bg text-success-1 border-0';
    case 'review_required':
      return 'bg-warning-bg text-warning-1 border-0';
    case 'failed':
      return 'bg-destructive-bg text-destructive-1 border-0';
    case 'processing':
      return 'bg-primary-bg-strong text-primary-1 border-0';
    case 'pending':
      return 'bg-bg-4 text-text-body border-0';
    default:
      return 'bg-bg-4 text-text-body border-0';
  }
};

const getConfidenceBadgeClass = (confidence: number): string => {
  if (confidence >= 0.8) return 'bg-success-bg text-success-1 border-0';
  if (confidence >= 0.5) return 'bg-warning-bg text-warning-1 border-0';
  return 'bg-destructive-bg text-destructive-1 border-0';
};
```

**Key Changes:**
- Card: `bg-bg-2 hover:bg-bg-3 border-0`
- CardHeader: `bg-bg-3` (elevated layer)
- Checkbox wrapped in hover zone: `hover:bg-bg-4 rounded p-2`
- Topic badges: `bg-primary-bg-subtle text-primary-1 border-0`
- "More" badge: `bg-bg-4 text-text-caption border-0`

---

## 3. SummaryPanel Component

### 3.1 Main Card Structure

**File**: `app/components/SummaryPanel.tsx` (lines 98-159)

#### Before:
```tsx
<Card className="overflow-hidden elevation-4 hover-lift">
  <div className="h-2 gradient-primary" />
  {/* Header */}
  <CardHeader className="pb-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="rounded-full bg-primary/10 p-2">
            <ListTodo className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl">AI Summary</CardTitle>
        </div>
        <CardDescription className="text-base">{filename}</CardDescription>
      </div>
      <div className="flex flex-col gap-2">
        {/* Confidence indicator */}
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground">Confidence</span>
            <span className="text-sm font-bold">{confidencePercent}%</span>
          </div>
          <Progress value={confidence * 100} className="h-1.5" />
        </div>
      </div>
    </div>
  </CardHeader>
</Card>
```

#### After:
```tsx
<Card className="overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 border-0 bg-bg-2">
  {/* Keep gradient stripe for brand moment */}
  <div className="h-2 bg-gradient-to-r from-primary-2 to-accent-2" />

  {/* Header */}
  <CardHeader className="pb-4 bg-bg-2">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="rounded-full bg-primary-bg-medium p-2">
            <ListTodo className="h-5 w-5 text-primary-2" />
          </div>
          <CardTitle className="text-xl text-text-primary">AI Summary</CardTitle>
        </div>
        <CardDescription className="text-base text-text-body">{filename}</CardDescription>
      </div>
      <div className="flex flex-col gap-2">
        {/* Confidence indicator */}
        <div className="flex flex-col gap-1 rounded-lg bg-bg-3 p-3 shadow-inner border-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-text-caption">Confidence</span>
            <span className="text-sm font-bold text-text-primary">{confidencePercent}%</span>
          </div>
          <Progress
            value={confidence * 100}
            className="h-1.5 bg-bg-4"
            indicatorClassName="bg-primary-2"
          />
        </div>
      </div>
    </div>
  </CardHeader>
</Card>
```

**Key Changes:**
- Card: `border-0 bg-bg-2 shadow-md hover:shadow-lg`
- Icon container: `bg-primary-bg-medium` with `text-primary-2`
- Confidence box: `bg-bg-3 shadow-inner` (inset depth)
- Progress bar: `bg-bg-4` with `indicatorClassName="bg-primary-2"`

---

### 3.2 Tabs Component

**File**: `app/components/SummaryPanel.tsx` (lines 161-175)

#### Before:
```tsx
<Tabs defaultValue="overview" className="w-full">
  <TabsList className="grid w-full grid-cols-3 mb-6">
    <TabsTrigger value="overview" className="flex items-center gap-2">
      <Activity className="h-4 w-4" />
      <span>Overview</span>
    </TabsTrigger>
    <TabsTrigger value="actions" className="flex items-center gap-2">
      <MoveRight className="h-4 w-4" />
      <span>Actions</span>
    </TabsTrigger>
    <TabsTrigger value="tasks" className="flex items-center gap-2">
      <ListTodo className="h-4 w-4" />
      <span>Tasks (LNO)</span>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

#### After:
```tsx
<Tabs defaultValue="overview" className="w-full">
  <TabsList className="grid w-full grid-cols-3 mb-6 bg-bg-3 p-1 gap-1 border-0">
    <TabsTrigger
      value="overview"
      className="flex items-center gap-2 bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      <Activity className="h-4 w-4" />
      <span>Overview</span>
    </TabsTrigger>
    <TabsTrigger
      value="actions"
      className="flex items-center gap-2 bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      <MoveRight className="h-4 w-4" />
      <span>Actions</span>
    </TabsTrigger>
    <TabsTrigger
      value="tasks"
      className="flex items-center gap-2 bg-transparent data-[state=active]:bg-bg-4 data-[state=active]:text-primary-2 data-[state=active]:shadow-sm transition-all text-text-body"
    >
      <ListTodo className="h-4 w-4" />
      <span>Tasks (LNO)</span>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

---

### 3.3 LNO Task Columns

**File**: `app/components/SummaryPanel.tsx` (lines 277-380)

#### Before (Leverage Column):
```tsx
<Card className="border-primary/50 overflow-hidden">
  <div className="h-1 bg-primary" />
  <CardHeader className="pb-3">
    <CardTitle className="text-sm flex items-center gap-2">
      <TrendingUp className="h-4 w-4 text-primary" />
      <span>Leverage</span>
      <Badge variant="default" className="ml-auto">
        {summary.lno_tasks.leverage.length}
      </Badge>
    </CardTitle>
    <CardDescription className="text-xs">High-impact strategic work</CardDescription>
  </CardHeader>
  <CardContent className="pt-0">
    <ScrollArea className="h-[300px]">
      <div className="space-y-2 pr-2">
        {summary.lno_tasks.leverage.map((task, index) => (
          <Card key={index} className="bg-primary/5 hover-lift">
            <CardContent className="p-3">
              <p className="text-xs leading-relaxed">{task}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  </CardContent>
</Card>
```

#### After (Leverage Column):
```tsx
<Card className="border-0 bg-bg-3 hover:bg-success-bg/50 transition-colors overflow-hidden shadow-sm">
  {/* Colored stripe for category identification */}
  <div className="h-1 bg-success-2" />

  <CardHeader className="pb-3 bg-bg-3">
    <CardTitle className="text-sm flex items-center gap-2">
      <div className="bg-success-bg rounded-full p-1">
        <TrendingUp className="h-4 w-4 text-success-1" />
      </div>
      <span className="text-text-primary">Leverage</span>
      <Badge className="ml-auto bg-success-bg text-success-1 border-0">
        {summary.lno_tasks.leverage.length}
      </Badge>
    </CardTitle>
    <CardDescription className="text-xs text-text-caption">
      High-impact strategic work
    </CardDescription>
  </CardHeader>

  <CardContent className="pt-0 bg-bg-2">
    {summary.lno_tasks.leverage.length === 0 ? (
      <p className="text-xs text-text-caption text-center py-8">
        No tasks identified
      </p>
    ) : (
      <ScrollArea className="h-[300px]">
        <div className="space-y-2 pr-2">
          {summary.lno_tasks.leverage.map((task, index) => (
            <Card
              key={index}
              className="bg-bg-4 hover:bg-success-bg/30 transition-colors shadow-sm border-0"
            >
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
```

#### After (Neutral Column):
```tsx
<Card className="border-0 bg-bg-3 hover:bg-info-bg/50 transition-colors overflow-hidden shadow-sm">
  <div className="h-1 bg-text-caption" />

  <CardHeader className="pb-3 bg-bg-3">
    <CardTitle className="text-sm flex items-center gap-2">
      <div className="bg-bg-4 rounded-full p-1">
        <Activity className="h-4 w-4 text-text-body" />
      </div>
      <span className="text-text-primary">Neutral</span>
      <Badge className="ml-auto bg-bg-4 text-text-body border-0 shadow-sm">
        {summary.lno_tasks.neutral.length}
      </Badge>
    </CardTitle>
    <CardDescription className="text-xs text-text-caption">
      Necessary operational tasks
    </CardDescription>
  </CardHeader>

  <CardContent className="pt-0 bg-bg-2">
    {/* Same structure as Leverage */}
  </CardContent>
</Card>
```

#### After (Overhead Column):
```tsx
<Card className="border-0 bg-bg-3 hover:bg-destructive-bg/50 transition-colors overflow-hidden shadow-sm">
  <div className="h-1 bg-destructive-2" />

  <CardHeader className="pb-3 bg-bg-3">
    <CardTitle className="text-sm flex items-center gap-2">
      <div className="bg-destructive-bg rounded-full p-1">
        <AlertTriangle className="h-4 w-4 text-destructive-1" />
      </div>
      <span className="text-text-primary">Overhead</span>
      <Badge className="ml-auto bg-destructive-bg text-destructive-1 border-0">
        {summary.lno_tasks.overhead.length}
      </Badge>
    </CardTitle>
    <CardDescription className="text-xs text-text-caption">
      Low-value administrative work
    </CardDescription>
  </CardHeader>

  <CardContent className="pt-0 bg-bg-2">
    {/* Same structure as Leverage */}
  </CardContent>
</Card>
```

**Key Changes:**
- All columns: `border-0 bg-bg-3 shadow-sm`
- Hover adds semantic tint: `hover:bg-success-bg/50` (Leverage), `hover:bg-info-bg/50` (Neutral), `hover:bg-destructive-bg/50` (Overhead)
- Icon wrapped in semantic background: `bg-success-bg rounded-full p-1`
- Task cards use `bg-bg-4` (lightest layer)
- Colored stripe at top: `bg-success-2`, `bg-text-caption`, `bg-destructive-2`

---

## 4. OutcomeBuilder Modal

### 4.1 Modal Container

**File**: `app/components/OutcomeBuilder.tsx` (lines 271-280)

#### Before:
```tsx
<Dialog open={open} onOpenChange={handleModalClose}>
  <DialogContent className="sm:max-w-[600px]">
    <DialogHeader>
      <DialogTitle>
        {isEditMode ? 'Edit Your Outcome Statement' : 'Set Your Outcome Statement'}
      </DialogTitle>
      <DialogDescription>
        Define what you want to achieve. Your outcome drives how actions are prioritized.
      </DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

#### After:
```tsx
<Dialog open={open} onOpenChange={handleModalClose}>
  <DialogContent className="sm:max-w-[600px] bg-bg-2 border-0 shadow-2xl">
    <DialogHeader className="bg-bg-3 -mx-6 -mt-6 px-6 py-4 mb-6 rounded-t-lg">
      <DialogTitle className="text-text-primary">
        {isEditMode ? 'Edit Your Outcome Statement' : 'Set Your Outcome Statement'}
      </DialogTitle>
      <DialogDescription className="text-text-body">
        Define what you want to achieve. Your outcome drives how actions are prioritized.
      </DialogDescription>
    </DialogHeader>

    {/* Form content here */}

  </DialogContent>
</Dialog>
```

**Key Changes:**
- DialogContent: `bg-bg-2 border-0 shadow-2xl`
- DialogHeader: `bg-bg-3 -mx-6 -mt-6 px-6 py-4 mb-6 rounded-t-lg` (elevated header)
- Text uses semantic color names

---

### 4.2 Form Inputs

**File**: `app/components/OutcomeBuilder.tsx` (lines 313-402)

#### Before:
```tsx
{/* Direction Field */}
<FormField
  control={form.control}
  name="direction"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Direction</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select direction" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="increase">Increase</SelectItem>
          <SelectItem value="decrease">Decrease</SelectItem>
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
```

#### After:
```tsx
{/* Direction Field */}
<FormField
  control={form.control}
  name="direction"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="text-text-body font-medium">Direction</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger className="bg-bg-3 border-0 focus:bg-bg-4 focus:ring-2 focus:ring-primary-2/20 text-text-body">
            <SelectValue placeholder="Select direction" />
          </SelectTrigger>
        </FormControl>
        <SelectContent className="bg-bg-3 border-0 shadow-lg">
          <SelectItem
            value="increase"
            className="hover:bg-bg-4 focus:bg-bg-4 focus:text-primary-2"
          >
            Increase
          </SelectItem>
          <SelectItem
            value="decrease"
            className="hover:bg-bg-4 focus:bg-bg-4 focus:text-primary-2"
          >
            Decrease
          </SelectItem>
          <SelectItem
            value="maintain"
            className="hover:bg-bg-4 focus:bg-bg-4 focus:text-primary-2"
          >
            Maintain
          </SelectItem>
          <SelectItem
            value="launch"
            className="hover:bg-bg-4 focus:bg-bg-4 focus:text-primary-2"
          >
            Launch
          </SelectItem>
          <SelectItem
            value="ship"
            className="hover:bg-bg-4 focus:bg-bg-4 focus:text-primary-2"
          >
            Ship
          </SelectItem>
        </SelectContent>
      </Select>
      <FormMessage className="text-destructive-1" />
    </FormItem>
  )}
/>

{/* Object Field */}
<FormField
  control={form.control}
  name="object"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="text-text-body font-medium">Object (what to affect)</FormLabel>
      <FormControl>
        <Input
          placeholder="e.g., monthly recurring revenue"
          maxLength={100}
          {...field}
          className="bg-bg-3 border-0 focus:bg-bg-4 focus:ring-2 focus:ring-primary-2/20 text-text-body placeholder:text-text-caption"
        />
      </FormControl>
      <FormMessage className="text-destructive-1" />
      <p className="text-xs text-text-caption">
        {field.value.length}/100 characters
      </p>
    </FormItem>
  )}
/>

{/* Clarifier Field (Textarea) */}
<FormField
  control={form.control}
  name="clarifier"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="text-text-body font-medium">Clarifier (how to achieve it)</FormLabel>
      <FormControl>
        <Textarea
          placeholder="e.g., enterprise customer acquisition"
          maxLength={150}
          rows={3}
          {...field}
          className="bg-bg-3 border-0 focus:bg-bg-4 focus:ring-2 focus:ring-primary-2/20 text-text-body placeholder:text-text-caption resize-none"
        />
      </FormControl>
      <FormMessage className="text-destructive-1" />
      <p className="text-xs text-text-caption">
        {field.value.length}/150 characters
      </p>
    </FormItem>
  )}
/>
```

**Key Changes:**
- All inputs: `bg-bg-3 border-0 focus:bg-bg-4 focus:ring-2 focus:ring-primary-2/20`
- Labels: `text-text-body font-medium`
- Character count: `text-text-caption`
- Validation errors: `text-destructive-1`
- Select dropdown: `bg-bg-3 border-0 shadow-lg`
- Select items: `hover:bg-bg-4 focus:bg-bg-4 focus:text-primary-2`

---

### 4.3 Preview Section

**File**: `app/components/OutcomeBuilder.tsx` (lines 405-411)

#### Before:
```tsx
<div className="rounded-lg border bg-muted/50 p-4">
  <p className="text-sm font-medium mb-2">Preview:</p>
  <p className="text-sm italic text-muted-foreground">
    {previewText}
  </p>
</div>
```

#### After:
```tsx
<div className="rounded-lg bg-bg-3 p-4 border-l-4 border-primary-2 shadow-inner">
  <p className="text-sm font-medium mb-2 text-text-caption">Preview:</p>
  <p className="text-sm italic text-text-body">
    {previewText}
  </p>
</div>
```

**Key Changes:**
- Removed outer border, added left accent: `border-l-4 border-primary-2`
- Background: `bg-bg-3 shadow-inner` (inset depth)
- Text colors: `text-text-caption` (label), `text-text-body` (preview)

---

### 4.4 Submit Buttons

**File**: `app/components/OutcomeBuilder.tsx` (lines 413-427)

#### Before:
```tsx
<div className="flex justify-end gap-3">
  <Button
    type="button"
    variant="outline"
    onClick={() => handleModalClose(false)}
    disabled={isSubmitting}
  >
    Cancel
  </Button>
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Outcome' : 'Set Outcome Statement')}
  </Button>
</div>
```

#### After:
```tsx
<div className="flex justify-end gap-3 -mb-6 -mx-6 bg-bg-3 px-6 py-4 rounded-b-lg">
  <Button
    type="button"
    variant="outline"
    onClick={() => handleModalClose(false)}
    disabled={isSubmitting}
    className="bg-bg-2 hover:bg-bg-4 border-0 text-text-body"
  >
    Cancel
  </Button>
  <Button
    type="submit"
    disabled={isSubmitting}
    className="bg-primary-2 hover:bg-primary-3 active:bg-primary-1 text-white"
  >
    {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Outcome' : 'Set Outcome Statement')}
  </Button>
</div>
```

**Key Changes:**
- Button container: Elevated footer `bg-bg-3 -mb-6 -mx-6 px-6 py-4 rounded-b-lg`
- Cancel button: `bg-bg-2 hover:bg-bg-4 border-0`
- Submit button: `bg-primary-2 hover:bg-primary-3 active:bg-primary-1`

---

## 5. Shared Components

### 5.1 OutcomeDisplay Banner

**File**: `app/components/OutcomeDisplay.tsx` (lines 81-107)

#### Before:
```tsx
<div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  <div className="container flex h-16 items-center justify-between px-4">
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span className="text-2xl" aria-label="Target">🎯</span>
      <p className="text-sm font-medium truncate" title={outcome.assembled_text}>
        {outcome.assembled_text}
      </p>
    </div>

    {onEdit && outcome && (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(outcome)}
        className="ml-2 shrink-0"
        aria-label="Edit outcome"
      >
        <span className="text-xl">✏️</span>
      </Button>
    )}
  </div>
</div>
```

#### After:
```tsx
<div className="sticky top-0 z-50 w-full bg-bg-2/95 backdrop-blur shadow-sm border-0">
  <div className="container flex h-16 items-center justify-between px-4 bg-primary-bg-subtle/30">
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="bg-primary-bg-medium rounded-full p-1.5">
        <span className="text-xl" aria-label="Target">🎯</span>
      </div>
      <p className="text-sm font-medium truncate text-text-primary" title={outcome.assembled_text}>
        {outcome.assembled_text}
      </p>
    </div>

    {onEdit && outcome && (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(outcome)}
        className="ml-2 shrink-0 hover:bg-bg-4 hover:text-primary-2"
        aria-label="Edit outcome"
      >
        <span className="text-xl">✏️</span>
      </Button>
    )}
  </div>
</div>
```

**Key Changes:**
- Removed `border-b`, added `shadow-sm border-0`
- Background: `bg-bg-2/95` with `bg-primary-bg-subtle/30` inner container
- Emoji wrapped: `bg-primary-bg-medium rounded-full p-1.5`
- Text: `text-text-primary`
- Button: `hover:bg-bg-4 hover:text-primary-2`

---

## 6. shadcn/ui Component Overrides

### 6.1 Button Component

**File**: `components/ui/button.tsx` (lines 7-37)

#### Replace entire `buttonVariants`:
```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary-2/30 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        // Primary: Brand color with 3-shade progression
        default: "bg-primary-2 text-white hover:bg-primary-3 active:bg-primary-1 shadow-sm",

        // Destructive: Error/delete actions
        destructive: "bg-destructive-2 text-white hover:bg-destructive-3 active:bg-destructive-1 shadow-sm",

        // Outline: Layered background, no border
        outline: "bg-bg-3 text-text-body hover:bg-bg-4 hover:text-primary-2 border-0 shadow-xs",

        // Secondary: Accent color
        secondary: "bg-accent-bg-medium text-accent-1 hover:bg-accent-bg-strong",

        // Ghost: Minimal styling
        ghost: "hover:bg-bg-4 hover:text-primary-2 text-text-body",

        // Link: Underlined text
        link: "text-primary-2 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

---

### 6.2 Badge Component

**File**: `components/ui/badge.tsx` (lines 7-26)

#### Replace entire `badgeVariants`:
```tsx
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-primary-2/30 transition-colors overflow-hidden border-0",
  {
    variants: {
      variant: {
        // Primary: Brand color
        default: "bg-primary-bg-strong text-primary-1",

        // Secondary: Neutral gray
        secondary: "bg-bg-4 text-text-body shadow-sm",

        // Destructive: Error state
        destructive: "bg-destructive-bg text-destructive-1",

        // Outline: Minimal with hover
        outline: "bg-bg-3 text-text-body hover:bg-bg-4 border-0",

        // Success: Positive state
        success: "bg-success-bg text-success-1",

        // Warning: Caution state
        warning: "bg-warning-bg text-warning-1",

        // Info: Neutral notification
        info: "bg-info-bg text-info-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

---

### 6.3 Input Component

**File**: `components/ui/input.tsx`

#### Add to className:
```tsx
<input
  className={cn(
    "flex h-9 w-full rounded-md bg-bg-3 px-3 py-1 text-sm text-text-body transition-colors",
    "placeholder:text-text-caption",
    "focus-visible:outline-none focus-visible:bg-bg-4 focus-visible:ring-2 focus-visible:ring-primary-2/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "border-0",
    className
  )}
  {...props}
/>
```

---

### 6.4 Select Component

**File**: `components/ui/select.tsx`

#### SelectTrigger:
```tsx
<SelectPrimitive.Trigger
  className={cn(
    "flex h-9 w-full items-center justify-between rounded-md bg-bg-3 px-3 py-2 text-sm text-text-body",
    "placeholder:text-text-caption",
    "focus:outline-none focus:bg-bg-4 focus:ring-2 focus:ring-primary-2/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "border-0",
    className
  )}
  {...props}
/>
```

#### SelectContent:
```tsx
<SelectPrimitive.Content
  className={cn(
    "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md bg-bg-3 text-text-body shadow-lg border-0",
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
    className
  )}
  {...props}
/>
```

#### SelectItem:
```tsx
<SelectPrimitive.Item
  className={cn(
    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none",
    "focus:bg-bg-4 focus:text-primary-2",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    className
  )}
  {...props}
/>
```

---

## Complete Migration Checklist

### Phase 1: Foundation
- [ ] Add new CSS variables to `globals.css` (both `:root` and `.dark`)
- [ ] Extend Tailwind config with new color utilities
- [ ] Update `button.tsx` component
- [ ] Update `badge.tsx` component
- [ ] Update `input.tsx` component
- [ ] Update `select.tsx` component
- [ ] Test in both light and dark modes

### Phase 2: Upload Page
- [ ] Update upload drop zone card (section 1.1)
- [ ] Update empty state card (section 1.2)
- [ ] Update file list cards (section 1.3)
- [ ] Update status badge function (section 1.4)
- [ ] Test drag-and-drop interactions
- [ ] Verify status badge colors in all states

### Phase 3: Dashboard
- [ ] Update filter tabs (section 2.1)
- [ ] Update bulk export bar (section 2.2)
- [ ] Update document grid cards (section 2.3)
- [ ] Add helper functions for semantic badge classes
- [ ] Test filtering and sorting
- [ ] Verify bulk export workflow

### Phase 4: SummaryPanel
- [ ] Update main card structure (section 3.1)
- [ ] Update tabs component (section 3.2)
- [ ] Update LNO task columns (section 3.3)
- [ ] Test tab switching
- [ ] Verify LNO column hover states

### Phase 5: Modals & Shared
- [ ] Update OutcomeBuilder modal (section 4)
- [ ] Update OutcomeDisplay banner (section 5.1)
- [ ] Test form validation and submission
- [ ] Verify modal transitions

### Phase 6: Accessibility Audit
- [ ] Run axe DevTools on all pages
- [ ] Run WAVE on all pages
- [ ] Test keyboard navigation
- [ ] Test with screen reader (VoiceOver/NVDA)
- [ ] Verify WCAG AA contrast ratios
- [ ] Test in high contrast mode

### Phase 7: Performance & Polish
- [ ] Remove legacy CSS variables (if not needed)
- [ ] Audit for remaining `border-*` classes
- [ ] Verify no layout shifts
- [ ] Test dark mode toggle performance
- [ ] Document new color usage patterns

---

## Troubleshooting Common Issues

### Issue: Text not readable on colored backgrounds
**Solution**: Use darker text shades
```tsx
// Before
<div className="bg-primary-bg-strong text-text-body"> ❌

// After
<div className="bg-primary-bg-strong text-primary-1"> ✅
```

### Issue: Focus states not visible enough
**Solution**: Increase ring opacity
```tsx
// Before
focus-visible:ring-2 ring-primary-2/20

// After
focus-visible:ring-2 ring-primary-2/40
```

### Issue: Layers not distinguishable in dark mode
**Solution**: Increase lightness delta in `globals.css`
```css
/* Before */
--bg-layer-1: oklch(0.0800 0 0);
--bg-layer-2: oklch(0.1200 0 0);

/* After */
--bg-layer-1: oklch(0.0800 0 0);
--bg-layer-2: oklch(0.1400 0 0); /* +0.02 instead of +0.04 */
```

### Issue: Borders still showing
**Solution**: Add `border-0` explicitly
```tsx
<Card className="border-0 bg-bg-2">
<Badge className="border-0 bg-success-bg">
```

---

## Next Steps

1. **Review** this implementation guide
2. **Test** color variables in Storybook/dev environment
3. **Begin Phase 1** migration (foundation components)
4. **Iterate** based on visual feedback
5. **Complete** accessibility audit after Phase 5
6. **Document** new patterns for team

**Questions?** Refer to `DEPTH_LAYER_SYSTEM.md` for theoretical background and color theory.
