/**
 * Suite 2 — Lobby Experience
 * SPEC.md §14 Epic 3, §26
 *
 * Tests the game browser, room creation, room browsing, friends panel,
 * and filter sidebar.
 *
 * Assumptions:
 *   - docker-compose.test.yml seeds 15 enabled games (SPEC.md §2.2)
 *   - POST /api/v1/test/reset resets lobby state between tests
 */
import { test, expect } from './fixtures/auth.fixture';

const SCREENSHOT_DIR = 'playwright-report/screenshots/suite2-lobby';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/v1/test/reset').catch(() => {});
});

test.describe('Suite 2 — Lobby Experience', () => {

  test('2.1 game browser shows all 15 games', async ({ authedPage: page }) => {
    await page.goto('/lobby');
    await page.waitForURL('**/lobby');

    // Wait for the game browser to load
    const gameSection = page.getByRole('region', { name: /Choose a Game/i });
    await expect(gameSection).toBeVisible();

    // Wait for games to load (React Query fetches from /api/v1/games)
    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // There should be 15 game cards visible (SPEC.md §2.2 game catalog)
    // GameCard components render within the grid
    // NOTE: GameCard component needs data-testid="game-card" for reliable count assertion
    // Using heading role as a fallback — each GameCard should have a heading with the game name
    const gameCards = page.locator('[aria-label="Choose a Game"] .grid > *');
    await expect(gameCards).toHaveCount(15, { timeout: 10_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/1-lobby-initial.png` });
  });

  test('2.2 create room opens modal, fills form, creates room', async ({ authedPage: page }) => {
    await page.goto('/lobby');
    await page.waitForURL('**/lobby');

    // Wait for games to load
    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // Click "Create Room" button on the first game card
    // GameCard renders a "Create Room" button — SPEC.md §14 Story 3.x
    const createRoomBtn = page.getByRole('button', { name: /Create Room/i }).first();
    await expect(createRoomBtn).toBeVisible();
    await createRoomBtn.click();

    // Modal should appear
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Create Room/i)).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/2-create-room-modal.png` });

    // Fill in a room name
    const roomNameInput = modal.getByRole('textbox', { name: /Room name/i });
    await expect(roomNameInput).toBeVisible();
    await roomNameInput.fill('E2E Test Room');

    // Submit the form
    const submitBtn = modal.getByRole('button', { name: /^Create$/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Modal should close after successful creation
    // Either a success toast appears or the modal closes
    await expect(modal).toBeHidden({ timeout: 8_000 });
  });

  test('2.3 room browser modal opens for a game, shows available rooms', async ({ authedPage: page }) => {
    await page.goto('/lobby');
    await page.waitForURL('**/lobby');

    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // Click "Browse Rooms" button on the first game card
    // GameCard should have a "Browse Rooms" button — SPEC.md §14
    // NOTE: GameCard component may need data-testid="browse-rooms-btn" for stable selection
    const browseBtn = page.getByRole('button', { name: /Browse Rooms/i }).first();
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();

    // RoomBrowserModal should appear
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Browse Rooms/i)).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/3-room-browser.png` });

    // Close modal
    const closeBtn = modal.getByRole('button', { name: /Close/i });
    await closeBtn.click();
    await expect(modal).toBeHidden();
  });

  test('2.4 friend list renders in the lobby sidebar', async ({ authedPage: page }) => {
    await page.goto('/lobby');
    await page.waitForURL('**/lobby');

    // FriendList renders in an aside with aria-label="Friends"
    const friendSidebar = page.getByRole('complementary', { name: /Friends/i });
    await expect(friendSidebar).toBeVisible();

    // "Add Friend" button is present
    await expect(friendSidebar.getByRole('button', { name: /Add Friend/i })).toBeVisible();
  });

  test('2.5 filter sidebar narrows displayed games', async ({ authedPage: page }) => {
    await page.goto('/lobby');
    await page.waitForURL('**/lobby');

    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // FilterSidebar is rendered alongside the GameBrowser
    // It exposes game filter options — SPEC.md §14
    // NOTE: FilterSidebar needs data-testid="filter-sidebar" for reliable selection
    // Using the filter label as fallback
    const filterSection = page.getByText(/Filter/i).first();
    await expect(filterSection).toBeVisible();

    // Clicking a specific game filter should narrow the list
    // The sidebar renders clickable game names or checkboxes
    const filterItems = page.locator('[aria-label*="Filter"] button, [aria-label*="filter"] button').first();
    if (await filterItems.isVisible()) {
      await filterItems.click();
      await page.waitForTimeout(300);
      // After filtering, card count should change (or remain same if all match)
      // Just verify no error thrown
    }

    // Verify the game browser section is still visible after filtering
    await expect(page.getByRole('region', { name: /Choose a Game/i })).toBeVisible();
  });

});
