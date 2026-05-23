"""Initial schema — users, user_repos, commits, graph_snapshots

Revision ID: 001
Revises:
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("github_id", sa.Integer, unique=True, index=True, nullable=False),
        sa.Column("login", sa.String(255), index=True, nullable=False),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("token", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "user_repos",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), index=True, nullable=False),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("repo_full_name", sa.String(255), nullable=False),
        sa.Column("default_branch", sa.String(255), nullable=False),
        sa.Column("repo_key", sa.String(300), unique=True, index=True, nullable=False),
        sa.Column("is_active", sa.Boolean, default=False, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "commits",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("hash", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("service_name", sa.String(255), index=True, nullable=False),
        sa.Column("author", sa.String(255), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "graph_snapshots",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("commit_hash", sa.String(255), nullable=True, index=True),
        sa.Column("commit_message", sa.Text, nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("repo_url", sa.String(500), nullable=True),
        sa.Column("service_name", sa.String(255), nullable=True, index=True),
        sa.Column("nodes_json", sa.Text, nullable=False),
        sa.Column("edges_json", sa.Text, nullable=False),
        sa.Column("node_count", sa.Integer, default=0),
        sa.Column("edge_count", sa.Integer, default=0),
        sa.Column("label", sa.String(500), nullable=True),
        sa.Column("taken_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("graph_snapshots")
    op.drop_table("commits")
    op.drop_table("user_repos")
    op.drop_table("users")
