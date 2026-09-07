/**
 * Room finishes live in @itsim/shared so the server can validate what the
 * player picks; this module just re-exports them for the renderer.
 */
export {
  WALL_PAINTS,
  FLOOR_STYLES,
  wallPaint,
  floorStyle,
  paintsFor,
  floorsFor,
  paintAllowed,
  floorAllowed,
} from '@itsim/shared';
export type { WallPaint, FloorStyle } from '@itsim/shared';
