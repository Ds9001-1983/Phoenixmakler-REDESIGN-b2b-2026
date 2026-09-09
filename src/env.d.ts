/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { TeamSession } from './lib/team-auth';

declare global {
  namespace App {
    interface Locals {
      /** Gesetzt von src/middleware.ts für Anfragen unter /intern. */
      team?: TeamSession | null;
    }
  }
}

export {};
