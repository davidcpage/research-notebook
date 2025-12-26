# AI Tutor Notebook

An interactive learning environment where Claude acts as your personal tutor. Ask questions, get explanations, take quizzes, and receive feedback - all in a visual notebook format.

## How It Works

This setup combines two interfaces:

1. **Browser window** - Shows your notebook with notes, quizzes, and learning materials
2. **Terminal** - Where you chat with Claude (using Claude Code)

Claude creates learning content that appears in your browser. When you take a quiz, Claude can review your answers and give feedback. The browser auto-updates when files change.

## Getting Started

### 1. Copy the template

```bash
cp -r examples/tutor-notebook ~/my-learning
cd ~/my-learning
```

### 2. Start the notebook server

```bash
# From the research-notebook repo
notebook
```

### 3. Open in browser

Go to `http://localhost:3000` and select your `my-learning` folder.

### 4. Start Claude Code

In a separate terminal:

```bash
cd ~/my-learning
claude
```

Tell Claude what you want to learn!

## What You Can Do

### Ask Questions
> "Explain how photosynthesis works"
> "What's the difference between TCP and UDP?"
> "Help me understand fractions"

Claude creates notes and examples that appear in your notebook.

### Take Quizzes
> "Quiz me on what we just covered"
> "Create a practice test for algebra"

Claude creates interactive quizzes. Open them in the browser to:
- Answer questions (multiple choice, numeric, written answers)
- Get hints when stuck
- See explanations after answering
- View your score and history

### Get Feedback
> "Review my quiz answers"

For written answers, Claude reads your responses and provides detailed feedback.

## Organizing Your Learning

Create folders for different subjects:

```
my-learning/
├── math/
│   ├── fractions.md
│   └── algebra-quiz.quiz.json
├── science/
│   ├── photosynthesis.md
│   └── biology-quiz.quiz.json
└── quizzes/           # General quizzes
```

Each folder becomes a section in your notebook.

## Quiz Types

| Type | What It Tests |
|------|---------------|
| Multiple choice | Recognition and recall |
| Numeric | Calculations and quantities |
| Short answer | Understanding in your own words |
| Worked problems | Problem-solving process |
| Matching | Associations and relationships |
| Ordering | Sequences and procedures |

Multiple choice, numeric, matching, and ordering are auto-graded instantly. Short answer and worked problems are reviewed by Claude.

## Tips for Effective Learning

1. **Start with what you know** - Tell Claude your current level
2. **Ask "why"** - Understanding beats memorization
3. **Take quizzes frequently** - Small tests help retention
4. **Review mistakes** - They're the best learning opportunities
5. **Build connections** - Ask how new concepts relate to previous ones

## Theme

This notebook uses the "friendly" theme - warm colors designed for comfortable reading during learning sessions. Customize in `.notebook/theme.css` if you prefer different colors.
