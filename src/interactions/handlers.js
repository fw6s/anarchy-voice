/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

// Panel logic lives in ./actions/*. Keys match the custom_id suffix:
// `vc:name` -> buttons["name"], `vc:trust:pick` -> selects["trust:pick"].
export const buttons = new Map();
export const modals = new Map();
export const selects = new Map();

export const onButton = (action, handler) => buttons.set(action, handler);
export const onModal = (action, handler) => modals.set(action, handler);
export const onSelect = (action, handler) => selects.set(action, handler);
