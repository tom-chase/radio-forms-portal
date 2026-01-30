#!/bin/bash

# Squash branch commits before creating PR
# Usage: ./scripts/squash-branch.sh [branch-name] [commit-message]

set -e

# Get branch name (default: current branch)
BRANCH=${1:-$(git branch --show-current)}
COMMIT_MSG=${2:-"feat: $(echo $BRANCH | sed 's/-/ /g' | sed 's/\b\w/\U&/g')"}
BASE_BRANCH=${3:-""}

echo "🔧 Squashing commits in branch '$BRANCH'..."

# Safety: refuse to rewrite history on protected branches
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "develop" ]; then
    echo "❌ Refusing to squash protected branch '$BRANCH'. Use this only on feature branches." >&2
    exit 1
fi

# Safety: require a clean working tree
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "❌ Working tree is not clean. Commit or stash changes before squashing." >&2
    exit 1
fi

# Check if we're on the branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "Switching to branch '$BRANCH'..."
    git checkout "$BRANCH"
fi

# Get the number of commits to squash
if [ -z "$BASE_BRANCH" ]; then
    if git show-ref --verify --quiet refs/heads/develop; then
        BASE_BRANCH="develop"
    else
        BASE_BRANCH="main"
    fi
fi

if ! git show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
    echo "❌ Base branch '$BASE_BRANCH' not found locally. Fetch it or pass a valid base branch as the 3rd arg." >&2
    exit 1
fi

MERGE_BASE=$(git merge-base "$BASE_BRANCH" "$BRANCH")
COMMIT_COUNT=$(git rev-list --count "$MERGE_BASE".."$BRANCH")

if [ $COMMIT_COUNT -eq 0 ]; then
    echo "❌ No commits to squash"
    exit 1
fi

echo "Found $COMMIT_COUNT commits to squash"

# Interactive rebase to squash
git reset --soft "$MERGE_BASE"
git commit -m "$COMMIT_MSG"

echo "✅ Squashed $COMMIT_COUNT commits into one"
echo "📝 Commit message: $COMMIT_MSG"
echo ""
echo "🚀 Ready to push and create PR!"
echo "   git push --force-with-lease origin $BRANCH"
