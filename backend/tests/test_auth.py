"""
Authentication endpoint tests.

Covers: register, login, get-me, token refresh, logout, change-password.

All endpoints return {"success": bool, "data": ..., "error": ...}.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

class TestRegister:

    async def test_register_success(self, async_client: AsyncClient):
        """A new user can register with valid credentials."""
        payload = {
            "username": "newuser",
            "display_name": "New User",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert data["user"]["username"] == "newuser"
        assert "access_token" in data

    async def test_register_duplicate_username(
        self, async_client: AsyncClient, test_user
    ):
        """Registering with an existing username returns 409."""
        payload = {
            "username": test_user.username,
            "display_name": "Dup User",
            "email": "dup_user@example.com",
            "password": "SecurePass123",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409, resp.text

    async def test_register_duplicate_email(
        self, async_client: AsyncClient, test_user
    ):
        """Registering with an existing email returns 409."""
        payload = {
            "username": "another_newuser",
            "display_name": "Another User",
            "email": test_user.email,
            "password": "SecurePass123",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409, resp.text

    async def test_register_invalid_password(self, async_client: AsyncClient):
        """A password one character below the minimum is rejected with 422.

        7 characters, not 2: the frontend form used to allow 6, so this length
        is the one that actually reached the API and failed.
        """
        payload = {
            "username": "shortpassuser",
            "display_name": "Short Pass",
            "email": "shortpass@example.com",
            "password": "Short12",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422, resp.text
        details = resp.json()["error"]["details"]
        # The client shows each message under the input it names, so the
        # offending field has to be identifiable.
        assert [d["loc"] for d in details] == [["body", "password"]]

    async def test_register_password_at_minimum(self, async_client: AsyncClient):
        """Exactly the minimum length is accepted."""
        payload = {
            "username": "minpassuser",
            "display_name": "Min Pass",
            "email": "minpass@example.com",
            "password": "Short123",  # 8 characters
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 201, resp.text

    async def test_validation_error_does_not_echo_the_password(
        self, async_client: AsyncClient
    ):
        """A 422 must not carry the rejected password back to the client.

        pydantic's errors() includes the rejected value under "input"; for this
        endpoint that is the plaintext password, and the response body may be
        captured by proxies or log collectors.
        """
        payload = {
            "username": "echocheck",
            "display_name": "Echo Check",
            "email": "echo@example.com",
            "password": "sekrit",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422, resp.text
        assert "sekrit" not in resp.text
        assert all("input" not in d for d in resp.json()["error"]["details"])


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class TestLogin:

    async def test_login_with_username(
        self, async_client: AsyncClient, test_user
    ):
        """A user can login using their username."""
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"account": test_user.username, "password": "TestPass123!"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert "access_token" in data
        assert data["user"]["username"] == test_user.username

    async def test_login_with_email(
        self, async_client: AsyncClient, test_user
    ):
        """A user can login using their email."""
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"account": test_user.email, "password": "TestPass123!"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["access_token"]

    async def test_login_wrong_password(
        self, async_client: AsyncClient, test_user
    ):
        """Login with wrong password returns 401."""
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"account": test_user.username, "password": "WrongPassword!"},
        )
        assert resp.status_code == 401, resp.text

    async def test_login_disabled_account(
        self, async_client: AsyncClient, async_db, test_user
    ):
        """A disabled account cannot login."""
        from sqlalchemy import update
        from app.models.user import User

        await async_db.execute(
            update(User).where(User.id == test_user.id).values(is_active=False)
        )
        await async_db.commit()

        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"account": test_user.username, "password": "TestPass123!"},
        )
        assert resp.status_code in (401, 403), resp.text


# ---------------------------------------------------------------------------
# Authenticated endpoints
# ---------------------------------------------------------------------------

class TestAuthenticatedEndpoints:

    async def test_get_me(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """GET /auth/me returns the current user."""
        headers = await auth_headers(test_user)
        resp = await async_client.get("/api/v1/auth/me", headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["id"] == str(test_user.id)
        assert data["username"] == test_user.username

    async def test_get_me_unauthenticated(self, async_client: AsyncClient):
        """GET /auth/me without token returns 401."""
        resp = await async_client.get("/api/v1/auth/me")
        assert resp.status_code == 401, resp.text

    async def test_refresh_token(
        self, async_client: AsyncClient, test_user
    ):
        """A valid refresh token cookie yields a new access token."""
        from app.utils.auth import create_refresh_token

        # The refresh endpoint reads from an HttpOnly cookie
        refresh_token = create_refresh_token({"sub": str(test_user.id)})
        resp = await async_client.post(
            "/api/v1/auth/refresh",
            cookies={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert "access_token" in data

    async def test_logout(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """Logout endpoint returns 200 and clears the cookie."""
        headers = await auth_headers(test_user)
        resp = await async_client.post("/api/v1/auth/logout", headers=headers)
        assert resp.status_code == 200, resp.text

    async def test_change_password(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """A user can change their password with correct current password."""
        headers = await auth_headers(test_user)
        resp = await async_client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "TestPass123!", "new_password": "NewSecure456!"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["success"] is True

    async def test_change_password_wrong_current(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """Providing the wrong current password is rejected."""
        headers = await auth_headers(test_user)
        resp = await async_client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "WrongOldPass!", "new_password": "NewSecure456!"},
            headers=headers,
        )
        assert resp.status_code == 400, resp.text

    async def test_change_password_enforces_the_registration_minimum(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """A new password below the shared minimum is rejected with 422.

        This endpoint used to allow 6 characters while registration demanded 8,
        so a user could pick a strong password at signup and immediately weaken
        it here.
        """
        headers = await auth_headers(test_user)
        resp = await async_client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "TestPass123!", "new_password": "Short12"},
            headers=headers,
        )
        assert resp.status_code == 422, resp.text
        details = resp.json()["error"]["details"]
        assert [d["loc"] for d in details] == [["body", "new_password"]]

    async def test_users_me_password_enforces_the_same_minimum(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """PUT /users/me/password shares the constant with the other two.

        A second change-password endpoint exists; both must agree, or the
        stricter one is merely advisory.
        """
        headers = await auth_headers(test_user)
        resp = await async_client.put(
            "/api/v1/users/me/password",
            json={"old_password": "TestPass123!", "new_password": "Short12"},
            headers=headers,
        )
        assert resp.status_code == 422, resp.text
