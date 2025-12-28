#!/usr/bin/env python3
"""
Manage student rosters for quiz grading.

Rosters map student IDs (used in notebook) to personal info (stored externally).
This keeps PII out of notebook files, enabling safe sharing and version control.

Usage:
    # Create roster from Google Forms export
    python manage_roster.py create responses.json --output roster.yaml

    # Look up student by ID
    python manage_roster.py lookup roster.yaml --id s001

    # Look up student by email
    python manage_roster.py lookup roster.yaml --email alice@school.edu

    # List all students
    python manage_roster.py list roster.yaml
"""
from __future__ import annotations

import argparse
import json
import sys
import os
from pathlib import Path
from datetime import datetime

# Optional: yaml for roster files
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def generate_student_id(index: int) -> str:
    """Generate a student ID from an index (1-indexed)."""
    return f"s{index:03d}"


def create_roster_from_responses(responses_path: str) -> dict:
    """
    Create a roster from a Google Forms response export.

    Expected format of responses file:
    {
        "responses": [
            {
                "respondentEmail": "alice@school.edu",
                "responseId": "2_ABaOnud...",
                "timestamp": "2025-01-15T10:30:00Z",
                ...
            }
        ]
    }

    Returns roster dict with student mappings.
    """
    with open(responses_path) as f:
        data = json.load(f)

    responses = data.get('responses', data if isinstance(data, list) else [])

    roster = {
        "created": datetime.utcnow().isoformat() + "Z",
        "source": responses_path,
        "students": {}
    }

    for i, response in enumerate(responses, 1):
        student_id = generate_student_id(i)

        # Extract email - try various possible field names
        email = (
            response.get('respondentEmail') or
            response.get('email') or
            response.get('Email') or
            f"student{i}@unknown"
        )

        # Extract name if available
        name = (
            response.get('respondentName') or
            response.get('name') or
            response.get('Name') or
            None
        )

        # Google Forms response ID for grade export
        response_id = (
            response.get('responseId') or
            response.get('id') or
            None
        )

        student_entry = {
            "email": email,
            "responseId": response_id
        }
        if name:
            student_entry["name"] = name

        roster["students"][student_id] = student_entry

    return roster


def save_roster(roster: dict, output_path: str):
    """Save roster to YAML or JSON file."""
    path = Path(output_path)

    if path.suffix in ('.yaml', '.yml'):
        if not HAS_YAML:
            print("Warning: PyYAML not installed, falling back to JSON", file=sys.stderr)
            output_path = str(path.with_suffix('.json'))
        else:
            with open(output_path, 'w') as f:
                yaml.dump(roster, f, default_flow_style=False, sort_keys=False)
            return

    # JSON fallback
    with open(output_path, 'w') as f:
        json.dump(roster, f, indent=2)


def load_roster(roster_path: str) -> dict:
    """Load roster from YAML or JSON file."""
    path = Path(roster_path)

    with open(roster_path) as f:
        if path.suffix in ('.yaml', '.yml') and HAS_YAML:
            return yaml.safe_load(f)
        else:
            return json.load(f)


def lookup_by_id(roster: dict, student_id: str) -> dict | None:
    """Look up student info by ID."""
    return roster.get("students", {}).get(student_id)


def lookup_by_email(roster: dict, email: str) -> tuple[str, dict] | None:
    """Look up student ID and info by email."""
    email_lower = email.lower()
    for sid, info in roster.get("students", {}).items():
        if info.get("email", "").lower() == email_lower:
            return (sid, info)
    return None


def list_students(roster: dict) -> list[tuple[str, dict]]:
    """List all students in roster."""
    return list(roster.get("students", {}).items())


def main():
    parser = argparse.ArgumentParser(
        description="Manage student rosters for quiz grading",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Create command
    create_parser = subparsers.add_parser('create', help='Create roster from responses')
    create_parser.add_argument('responses', help='Path to responses JSON file')
    create_parser.add_argument('-o', '--output', required=True, help='Output roster file (.yaml or .json)')

    # Lookup command
    lookup_parser = subparsers.add_parser('lookup', help='Look up student in roster')
    lookup_parser.add_argument('roster', help='Path to roster file')
    lookup_group = lookup_parser.add_mutually_exclusive_group(required=True)
    lookup_group.add_argument('--id', help='Student ID to look up')
    lookup_group.add_argument('--email', help='Email to look up')

    # List command
    list_parser = subparsers.add_parser('list', help='List all students in roster')
    list_parser.add_argument('roster', help='Path to roster file')
    list_parser.add_argument('--format', choices=['table', 'json'], default='table', help='Output format')

    args = parser.parse_args()

    if args.command == 'create':
        roster = create_roster_from_responses(args.responses)
        save_roster(roster, args.output)
        print(f"Created roster with {len(roster['students'])} students: {args.output}")

    elif args.command == 'lookup':
        roster = load_roster(args.roster)

        if args.id:
            info = lookup_by_id(roster, args.id)
            if info:
                print(f"Student {args.id}:")
                print(json.dumps(info, indent=2))
            else:
                print(f"Student {args.id} not found", file=sys.stderr)
                sys.exit(1)

        elif args.email:
            result = lookup_by_email(roster, args.email)
            if result:
                sid, info = result
                print(f"Student {sid}:")
                print(json.dumps(info, indent=2))
            else:
                print(f"Email {args.email} not found", file=sys.stderr)
                sys.exit(1)

    elif args.command == 'list':
        roster = load_roster(args.roster)
        students = list_students(roster)

        if args.format == 'json':
            print(json.dumps(roster['students'], indent=2))
        else:
            print(f"{'ID':<8} {'Email':<30} {'Name':<20}")
            print("-" * 60)
            for sid, info in students:
                email = info.get('email', 'N/A')[:28]
                name = (info.get('name') or 'N/A')[:18]
                print(f"{sid:<8} {email:<30} {name:<20}")

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
