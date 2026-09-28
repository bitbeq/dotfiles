---
name: quickshell-hyprland
description: Build, refactor, debug, and review production-quality Quickshell desktop-shell code for Hyprland on Arch Linux with UWSM. Use for QML/QtQuick status bars, panels, popups, notification daemons/centers, OSDs, launchers, system trays, workspaces, media/audio/network/Bluetooth/battery controls, IPC/global shortcuts, multi-monitor behavior, shell architecture, and Quickshell integration. Enforces version-aware official APIs, reactive services, correct QtQuick sizing/models, Wayland focus/layer semantics, UWSM-aware process launching, performance, and maintainable component boundaries.
compatibility: Quickshell 0.3.x (stable baseline 0.3.1), Qt 6, Hyprland, Wayland, Arch Linux, UWSM. Verify installed versions before using version-sensitive APIs; do not assume quickshell-git/master APIs.
---

# Quickshell + Hyprland

Build the shell as a real desktop environment component, not as a collection of QML snippets. Favor correctness, reactive state, clear ownership, low idle work, smooth reloads, and behavior that survives multiple monitors and transient service state.

## Non-negotiable rules

1. **Verify APIs before writing them.** Quickshell is pre-1.0 and changes quickly. Prefer documentation matching the installed Quickshell version. Never invent a property, signal, enum, module, or method from memory.
2. **Use Quickshell's native integrations before subprocess polling.** Prefer `Quickshell.Hyprland`, PipeWire, MPRIS, SystemTray, UPower, Networking, Bluetooth, notifications, `SystemClock`, desktop entries, IPC, and Wayland types when they cover the need.
3. **Run one coherent shell process.** Do not split the bar, notifications, launcher, OSD, etc. into separate Quickshell processes merely for modularity. Split code into modules/services/components inside the shell.
4. **Separate state from presentation.** Long-lived integration/state belongs in service singletons or focused controllers; windows and delegates render and invoke it. Do not turn `shell.qml` or a visual component into a god object.
5. **Respect QtQuick sizing rules.** Implicit size flows from children toward parents; actual size flows from parents toward children. Do not emulate CSS layout habits or use `childrenRect` as a generic container-sizing shortcut.
6. **Treat multi-monitor behavior as a first-class requirement.** Use `Quickshell.screens` + `Variants` for per-screen non-`Item` objects such as panels/windows. Do not duplicate monitor windows manually.
7. **Respect Wayland input and focus semantics.** A visual overlay must not accidentally consume the full screen. Set layer, anchors, keyboard focus, and input mask deliberately.
8. **Respect UWSM session ownership.** Long-lived GUI applications launched from the shell should normally go through UWSM. Autostart the shell with a user service tied to the graphical session rather than defaulting to Hyprland `exec-once`.
9. **Keep hot paths reactive and cheap.** Avoid timers/process loops for data that already emits changes. Avoid rebuilding entire list models when incremental/reactive models are available.
10. **Never weaken lockscreen security for convenience.** A normal panel or exclusive keyboard focus is not a secure lockscreen. Use `WlSessionLock` for a real lockscreen.

## Start every task with a targeted environment pass

Do not perform a giant audit for a tiny edit. Gather only what is needed to avoid incorrect assumptions.

### 1. Inspect the existing shell

Locate the entrypoint and relevant modules before editing:

```bash
find . -maxdepth 3 -type f \
  \( -name 'shell.qml' -o -name '*.qml' -o -name 'qmldir' -o -name '.qmlls.ini' \) \
  | sort | head -200
```

Then inspect the smallest set of files that establish:

- root composition and imports;
- service ownership;
- theme/config conventions;
- per-monitor behavior;
- existing module boundaries;
- the component being changed.

Preserve a coherent existing architecture unless the task specifically calls for restructuring it.

### 2. Resolve versions before using version-sensitive APIs

When shell commands are available, prefer:

```bash
qs --version
hyprctl version
uwsm --version
```

Also inspect the package/configuration source if that is more reliable in the repo. If `qs --version` is unavailable, do not block a small task unnecessarily; use the project's pinned/versioned assumptions and say what was assumed.

For Quickshell 0.3.x, open documentation for the installed patch release whenever a type or property is uncertain. The current stable baseline for this skill is 0.3.1, not master.

### 3. Keep QML tooling healthy

For a Quickshell project, keep an empty `.qmlls.ini` beside `shell.qml` so Quickshell can populate the managed QML language-server configuration. Usually gitignore it unless the project deliberately tracks it.

Treat `qmlls` diagnostics as useful but not infallible for Quickshell-specific types. Verify suspicious Quickshell diagnostics against the installed-version docs before "fixing" valid code.

## Source priority

When researching an API, use this order:

1. **Quickshell docs for the installed release** (`quickshell.org/docs/vX.Y.Z/...`).
2. **Qt 6 QML/QtQuick docs** for language, layouts, models, rendering, focus, and performance.
3. **Hyprland and UWSM official docs** for compositor/session behavior.
4. **Quickshell changelog/release notes** when behavior differs between patch/minor releases.
5. **Mature shells such as Caelestia and end-4** for architecture and UX patterns only.

Never copy a Caelestia/end-4 API usage merely because it compiles on `quickshell-git`. Translate the pattern to the user's installed stable API.

## Default architecture

For a new or lightly structured shell, prefer this shape:

```text
shell.qml
components/          # reusable visual primitives; little/no platform state
config/              # theme, appearance, user-facing settings
modules/
  bar/
  notifications/
  osd/
  launcher/
services/            # long-lived platform/integration state
utils/               # small helpers, no dumping ground
```

Keep `shell.qml` a composition root: initialize required services and mount feature modules. It should not contain the implementation of the status bar, notification history, media logic, etc.

Dependency direction should normally be:

```text
platform / Quickshell APIs
          ↓
       services
          ↓
 feature modules/controllers
          ↓
 reusable visual components
```

Visual components may receive data/actions as properties and callbacks instead of importing every service singleton directly. This keeps generic components reusable and tests/reasoning local.

For the detailed architecture rules, read [references/architecture.md](references/architecture.md).

## QML and QtQuick code standard

### Properties and object structure

- Prefer concrete QML property types over `var` when the type is known.
- Use `required property` for inputs a component cannot function without.
- Give objects meaningful `id`s when they are referenced outside their own scope.
- Qualify non-local references through the owning `id` rather than relying on ambiguous lexical lookup.
- Group declarations consistently: ids/properties/signals/functions, then object properties, then children.
- Use local inline `component` declarations for small reusable pieces that are private to one module; promote them to files when they become shared or independently complex.
- Prefer Quickshell root-relative imports such as `import qs.modules.bar` for shell-local modules; avoid obsolete `root:/` imports and fragile parent-directory traversal.
- Use `pragma ComponentBehavior: Bound` where delegate/component scoping benefits from it, and pass model roles through required properties instead of relying on implicit delegate context.

### Sizing and layout

- A reusable `Item`/component should usually expose sensible `implicitWidth` and `implicitHeight` derived from its content.
- Parent containers assign actual `width`/`height`; children should not fight their layout manager.
- Inside `RowLayout`/`ColumnLayout`/`GridLayout`, use `Layout.*` constraints. Do not anchor an immediate child to its layout parent.
- Use anchors for simple relative positioning; use layouts where multiple siblings negotiate size.
- Avoid `childrenRect` as a general layout mechanism; it easily creates binding loops and ignores some transformed/negative geometry cases.
- Use Quickshell wrapper types when their implicit-size behavior matches the job rather than rebuilding the same pattern manually.
- Prefer integer-aligned geometry for repeated/list content when practical to reduce visual jitter and unnecessary rendering work.

### Models and delegates

- Keep persistent state in the model/service, not in a `ListView` delegate that can be destroyed or reused.
- When a JavaScript-derived list changes over time, prefer a model that can express incremental changes (for example `ScriptModel` when appropriate) instead of forcing every delegate to be recreated.
- Keep delegates light. Avoid expensive nested effects, clipping, processes, and service discovery per row.
- Key identity deliberately. Do not assume array position is stable identity.

### Animation and rendering

- Animate meaningful state changes; do not animate every property because it looks possible.
- Prefer transforms/opacity for cheap transitions where they achieve the desired result.
- Avoid transparent full-screen windows when a small surface or input region can do the job.
- Mark truly opaque windows/surfaces as opaque when appropriate so the compositor can skip unnecessary blending.
- Use `LazyLoader` for expensive or rarely needed windows/modules, not as a default wrapper around every component.

## Platform integration rules

### Hyprland

Prefer `import Quickshell.Hyprland` and its reactive objects/models for workspaces, monitors, focused workspace/monitor, toplevels, and dispatchers.

- Use `Hyprland.monitorFor(screen)` to bridge a Quickshell `ShellScreen` to Hyprland monitor state.
- Use the dedicated fields/models first; use `Hyprland.rawEvent` only when the module does not expose the needed state reactively.
- Use `Hyprland.dispatch(...)` for compositor actions instead of spawning `hyprctl dispatch` repeatedly.
- Guard nullable objects such as focused monitor/workspace/toplevel.
- Do not parse `hyprctl -j` in a timer for information already available in the native module.

### Panels, popups, overlays, locks

Use the semantic Quickshell window type for the job:

- `PanelWindow`: bars, docks, edge panels that participate in layer-shell/exclusion.
- `PopupWindow`: anchored transient popup tied to another window/item.
- Wayland layer-shell properties: when explicit layer, namespace, keyboard focus, or input-region behavior is needed.
- `WlSessionLock`: secure lockscreen surfaces.

Read [references/panels-popups.md](references/panels-popups.md) before implementing or substantially changing these surfaces.

### IPC and shortcuts

- Use `IpcHandler` for stable external control (`qs ipc ...`) and expose a small typed interface.
- IPC handler functions should have explicit argument/return types and stable, unique targets.
- Use `GlobalShortcut` when a direct compositor shortcut is the right hot path. Keep `appid`/shortcut names unique and document the corresponding Hyprland bind.
- Do not expose every internal method over IPC; expose intentional shell operations such as `toggle`, `open`, `close`, `showOsd`, or diagnostics.

### Processes

`Process.command` and `Quickshell.execDetached()` take argument lists. Preserve that model:

```qml
Quickshell.execDetached(["program", "--flag", value])
```

Do not concatenate untrusted/dynamic text into `sh -c`. Use a shell only when shell semantics are genuinely required and quote/validate inputs deliberately.

For small one-shot utilities with no native Quickshell integration, `Process` is fine. For continuous state, prefer a native service or a long-lived event stream over polling.

For GUI application launches under UWSM, follow [references/uwsm-arch.md](references/uwsm-arch.md).

## Feature routing

Read only the references relevant to the task:

- **New shell / large refactor / service ownership / reload behavior:** [references/architecture.md](references/architecture.md)
- **Bar / dock / popup / dashboard / OSD / monitor placement / focus:** [references/panels-popups.md](references/panels-popups.md)
- **Notification daemon / popup stack / history / DND / actions:** [references/notifications.md](references/notifications.md)
- **Audio / MPRIS / tray / battery / network / Bluetooth / clock / desktop entries:** [references/services-integrations.md](references/services-integrations.md)
- **UWSM autostart / GUI launching / Arch package/version assumptions:** [references/uwsm-arch.md](references/uwsm-arch.md)
- **Finishing a feature or reviewing generated code:** [references/review-checklist.md](references/review-checklist.md)
- **Research provenance and authoritative links:** [references/sources.md](references/sources.md)

## Implementation workflow

Use the smallest workflow that produces a reliable result.

1. **Understand the behavior.** Identify the user-visible states, ownership of state, monitor/window scope, and platform APIs involved.
2. **Inspect local conventions.** Reuse existing theme primitives, spacing, animation helpers, service patterns, and naming when they are sound.
3. **Confirm uncertain APIs.** Check installed-version Quickshell docs before coding, especially for networking, Wayland, notifications, IPC, or APIs copied from newer shells.
4. **Define state boundaries.** Decide what is global, per-screen, per-window, per-popup, and ephemeral before writing UI bindings.
5. **Implement vertically.** Make the smallest complete path work (service → state → surface → interaction) before adding polish.
6. **Handle transient/null states.** Audio defaults can change, monitors disappear, windows close, notifications expire, and services initialize asynchronously. Avoid optimistic dereferences.
7. **Polish without adding architecture debt.** Extract only genuinely reusable pieces. Keep animation, styling, and event handling understandable.
8. **Validate.** Use the checklist below and the feature-specific reference.

Do not produce pages of speculative architecture before coding unless the user asked for a design/spec. For normal coding sessions, make a short plan and start implementing.

## Validation before calling work complete

At minimum:

- inspect changed QML for nonexistent or wrong-version APIs;
- resolve obvious QML syntax/type/binding errors;
- check console output/reload logs if the shell can be run safely;
- verify multi-monitor assumptions for any panel/window feature;
- verify focus/input region for any popup/overlay;
- verify null/readiness guards for service-backed data;
- verify there is no new process polling where a reactive API exists;
- verify list/delegate state survives delegate recreation;
- verify UWSM semantics for app launching/autostart changes;
- exercise the changed interaction, including close/dismiss/error paths.

For a full review, use [references/review-checklist.md](references/review-checklist.md).

## Anti-patterns to reject during review

Flag and fix these unless there is a documented reason:

- one Quickshell process per widget/module;
- `shell.qml` containing most of the application logic;
- timer + `hyprctl`, `wpctl`, `playerctl`, `nmcli`, `bluetoothctl`, `upower`, or `date` polling when a native reactive API already covers it;
- a `Process` created in every repeated delegate;
- `sh -c` used only to avoid passing an argument list;
- broad `var` use for known scalar/object types;
- state stored only inside recyclable list delegates;
- immediate Layout children using anchors against the Layout parent;
- `childrenRect` used as the universal implicit-size solution;
- full-screen overlay surfaces consuming pointer input outside visible content;
- keyboard-exclusive layer surfaces used as a fake lockscreen;
- notification capabilities advertised without actually implementing them;
- notification body rendered as rich text while claiming markup is unsupported;
- PipeWire volume/mute accessed without tracking the node properties required by the API;
- Caelestia/end-4 code copied from `quickshell-git` into stable 0.3.x without checking docs;
- Hyprland `exec-once = qs ...` added as the default autostart path in a UWSM-managed session;
- long-lived GUI apps launched as unmanaged compositor children when UWSM should own them.

## Expected output from this skill

When implementing code, leave the repository in a coherent state. In the final response, summarize:

- what behavior was added/changed;
- the important architectural/API choices;
- how it was validated;
- any version/environment assumption that could not be verified.

Do not bury the result under generic QML tutorials.
