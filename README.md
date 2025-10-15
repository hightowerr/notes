# AI Note Synthesiser

An autonomous document processing system that converts uploaded files (PDF, DOCX, TXT) into structured insights using AI. The system extracts topics, decisions, actions, and categorizes tasks using the LNO (Leverage/Neutral/Overhead) framework for strategic prioritization.

## 🚀 Features

- **Autonomous Processing**: Upload documents and receive AI-powered analysis automatically
- **Multi-format Support**: Handles PDF, DOCX, TXT, and Markdown files
- **Structured Output**: Extracts topics, decisions, actions, and LNO task classifications
- **Outcome Management**: Set strategic outcomes to guide AI scoring and prioritization
- **Real-time Status**: Live processing updates with queue management
- **Bulk Export**: Export multiple documents as JSON or Markdown
- **Dashboard View**: Comprehensive document management with filtering and sorting
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🏗️ Architecture

Built with modern web technologies:

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **AI Integration**: OpenAI API for document analysis
- **File Processing**: PDF-parse, Mammoth (DOCX), native text handling
- **Testing**: Vitest with React Testing Library

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun
- Supabase account
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd notes
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` with your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_api_key
   ```

4. **Set up the database**
   ```bash
   # Run Supabase migrations
   npm run db:migrate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage

### Basic Workflow

1. **Set Strategic Outcome** (Optional but recommended)
   - Click "Set Outcome" to define your strategic goal
   - This helps the AI score and prioritize actions based on alignment

2. **Upload Documents**
   - Drag & drop files or click to browse
   - Supports PDF, DOCX, TXT, and Markdown files
   - Maximum file size: 10MB

3. **Monitor Processing**
   - Real-time status updates show processing progress
   - Queue management handles multiple uploads efficiently
   - Processing typically completes within 8 seconds

4. **Review Results**
   - View extracted topics, decisions, and actions
   - See LNO task classifications (Leverage/Neutral/Overhead)
   - Check confidence scores and processing metrics

5. **Export Data**
   - Individual document export as JSON or Markdown
   - Bulk export multiple documents as ZIP archive
   - Access via dashboard at `/dashboard`

### Dashboard Features

- **Document Management**: View all uploaded documents
- **Filtering**: Filter by status (completed, processing, failed, etc.)
- **Sorting**: Sort by date, name, confidence, or file size
- **Bulk Operations**: Select and export multiple documents
- **Detailed Views**: Expand cards to see full analysis results

## 🧪 Testing

The project includes comprehensive testing:

```bash
# Run all tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests once
npm run test:run

# Run specific test suites
npm run test:unit      # Unit tests
npm run test:contract  # Contract tests
npm run test:integration # Integration tests
```

### Test Coverage

- **Unit Tests**: Component logic and utility functions
- **Contract Tests**: API endpoint validation
- **Integration Tests**: End-to-end workflows
- **Coverage Target**: ≥80% line coverage

## 📁 Project Structure

```
notes/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── components/        # React components
│   ├── dashboard/         # Dashboard page
│   └── page.tsx          # Home page
├── components/            # Shared UI components
├── lib/                   # Core business logic
│   ├── hooks/            # Custom React hooks
│   ├── schemas/          # Data validation schemas
│   └── services/         # AI and processing services
├── specs/                 # Feature specifications
├── supabase/             # Database migrations
├── __tests__/            # Test files
└── docs/                 # Documentation
```

## 🔧 Development

### Key Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run test suite
npm run test:ui      # Run tests with UI
```

### Code Quality

- **ESLint**: Code linting and style enforcement
- **TypeScript**: Type safety and better developer experience
- **Prettier**: Code formatting (via ESLint)
- **Husky**: Git hooks for pre-commit checks

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## 📊 Performance

- **Processing Time**: <8 seconds average for standard documents
- **File Size Limit**: 10MB maximum
- **Concurrent Processing**: Up to 3 files simultaneously
- **Queue Management**: Automatic queuing for additional uploads
- **Reliability**: ≥95% file detection success rate

## 🔒 Security

- **File Validation**: Client and server-side file type/size validation
- **Rate Limiting**: Built-in protection against abuse
- **Data Retention**: Automatic cleanup after 30 days
- **Secure Storage**: Supabase RLS policies for data protection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the [documentation](./docs/)
- Review [test scenarios](./specs/)
- Open an issue on GitHub

---

**Built with ❤️ using Next.js 15, React 19, and TypeScript**
