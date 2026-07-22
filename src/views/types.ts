// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { Dataset } from '../data';

export interface ViewContext {
  data: Dataset;
  /** Open the SA2 drill-down drawer. */
  openRegion: (code: string) => void;
  /** Switch to another view, optionally handing it a filter payload. */
  setView: (key: string, payload?: unknown) => void;
  /** Payload passed by whichever view called setView. */
  payload?: unknown;
  /** Register cleanup to run when this view is torn down. */
  onDispose: (fn: () => void) => void;
}

export type ViewRenderer = (container: HTMLElement, ctx: ViewContext) => void | Promise<void>;
