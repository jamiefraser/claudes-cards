/**
 * useRooms — React Query wrapper for /rooms API.
 * Keeps lobbyStore.rooms in sync with server data.
 */
import { useQuery } from '@tanstack/react-query';
import { getRooms } from '@/api/rooms.api';
import { useLobbyStore } from '@/store/lobbyStore';
import type { RoomListQuery } from '@shared/rooms';
import { logger } from '@/utils/logger';

const ROOMS_STALE_TIME_MS = 10_000; // 10 seconds

/**
 * Fetches rooms matching the given filters.
 * Syncs results into the lobby store.
 */
export function useRooms(query: RoomListQuery = {}) {
  const setRooms = useLobbyStore(s => s.setRooms);

  return useQuery({
    queryKey: ['rooms', query],
    queryFn: async () => {
      logger.debug('useRooms: fetching', query);
      const result = await getRooms(query);
      setRooms(result.rooms, result.total);
      return result;
    },
    staleTime: ROOMS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
