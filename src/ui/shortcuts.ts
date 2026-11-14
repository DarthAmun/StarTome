/** Every keyboard shortcut of the app, in one list: the cheat sheet (`?`) and Settings show it. */
export interface ShortcutGroup { where: string; keys: [keys: string, does: string][] }

export const SHORTCUTS: ShortcutGroup[] = [
  { where: 'Anywhere', keys: [
    ['Ctrl K', 'Command bar: go to a place, find an entry, look up a rule, type a command'],
    ['?', 'This list'],
    ['Esc', 'Close a dialog or a menu; close the dock'],
    ['Alt L', 'Log a line to the running session'],
  ] },
  { where: 'Command bar', keys: [
    ['↑ ↓', 'Move through the results'],
    ['Enter', 'Open in the dock'],
    ['Shift Enter', 'Open the page'],
    ['new npc Name', 'Create an entry of any type'],
    ['roll 2d6+3', 'Roll dice'],
    ['dc 5 hard', 'A DC by level or proficiency'],
    ['rename · append · set · favourite · delete', 'Change the entry open in the dock'],
  ] },
  { where: 'World list', keys: [
    ['/', 'Search'],
    ['↑ ↓', 'Move through the list'],
    ['Enter', 'Open in the dock'],
    ['Shift Enter', 'Open the page'],
    ['Space', 'Favourite'],
  ] },
  { where: 'Text editor', keys: [
    ['Ctrl B', 'Bold'],
    ['Ctrl I', 'Italic'],
    ['Tab · Shift Tab', 'Indent, outdent'],
    ['{{', 'Link an entry, an encounter, a graph or a compendium entry'],
    ['Ctrl Z · Ctrl Y', 'Undo, redo'],
    ['Esc', 'Leave the block'],
  ] },
  { where: 'Encounter', keys: [
    ['A', 'Quick add while the fight runs'],
    ['Enter', 'Apply the number typed in an HP field; finish a wall'],
    ['Backspace · Ctrl Z', 'Take back the last wall point; undo the last wall'],
    ['Esc', 'Back to the select tool'],
    ['Alt drag · middle button', 'Pan the map'],
    ['Shift click (ping)', 'Ping and centre the players’ view'],
  ] },
  { where: 'Map maker', keys: [
    ['V H B M W G', 'Select, pan, brush, rectangle, room, fill'],
    ['Ctrl Z · Ctrl Y', 'Undo, redo'],
    ['Ctrl D', 'Duplicate the selected asset'],
    ['Delete', 'Remove it'],
    ['R · Shift R', 'Rotate right, left'],
    ['F', 'Mirror'],
    ['[ ]', 'Send back, bring forward'],
    ['Arrows · Shift arrows', 'Nudge by half a square, by a tenth'],
    ['+ − 0', 'Zoom in, out, fit'],
    ['Space drag', 'Pan'],
    ['Shift', 'Place or move off the grid'],
  ] },
  { where: 'Session board', keys: [
    ['Enter', 'Log what you typed in the capture bar'],
    ['Double-click', 'Open a panel beside the board'],
    ['Right-click', 'Add a panel at the pointer'],
  ] },
  { where: 'Desk', keys: [
    ['Shift click', 'Select several widgets to move together'],
    ['Wheel', 'Zoom'],
  ] },
]
