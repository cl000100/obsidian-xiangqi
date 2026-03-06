<script lang="ts">
  import { setIcon, Menu } from "obsidian";
  import type { EventBus } from "../../core/event-bus";
  import type { ISettings, IMove } from "../../types";
  import { isIOS } from "../../utils/device";

  interface Props {
    settings: ISettings;
    eventBus: EventBus;
    modified: boolean;
    PGN: IMove[];
    isprotected: boolean;
  }

  let { settings, eventBus, modified, PGN, isprotected }: Props = $props();

  let buttonClass: string = $state("");

  $effect(() => {
    buttonClass = modified ? "unsaved" : PGN.length > 0 ? "saved" : "empty";
  });

  const buttons = [
    { title: "重置", icon: "refresh-cw", event: "reset" },
    { title: "开局", icon: "arrow-left-to-line", event: "toStart" },
    { title: "回退", icon: "arrow-left", event: "undo" },
    { title: "前进", icon: "arrow-right", event: "redo" },
    { title: "终局", icon: "arrow-right-to-line", event: "toEnd" },
    { title: "翻转", icon: "flip-vertical", event: "rotate" },
    { title: "分享", icon: "external-link", event: "toggle-share-menu" },
  ];

  let saveBtnEl: HTMLButtonElement;

  function emitEvent(name: string) {
    eventBus.emit(name);
  }

  function useSetIcon(el: HTMLElement, icon: string) {
    setIcon(el, icon);
    return {
      update(newIcon: string) {
        setIcon(el, newIcon);
      },
    };
  }

  function useSetSaveIcon(el: HTMLElement) {
    setIcon(el, "save");
  }

  // 分享菜单
  function handleShareMenu(evt: MouseEvent) {
    const menu = new Menu();

    menu.addItem((mi) => {
      mi.setTitle("皮卡鱼Web")
        .setIcon("external-link")
        .onClick(() => emitEvent("openPikafish"));
    });

    menu.addItem((mi) => {
      mi.setTitle("变招PGN")
        .setIcon("copy")
        .onClick(() => emitEvent("copyPGN"));
    });

    menu.addItem((mi) => {
      mi.setTitle("中文PGN")
        .setIcon("copy")
        .onClick(() => emitEvent("copyChinesePGN"));
    });

    menu.addItem((mi) => {
      mi.setTitle("UBB格式")
        .setIcon("copy")
        .onClick(() => emitEvent("copyUBB"));
    });

    menu.showAtMouseEvent(evt);
  }
</script>

<div class="toolbar-container {(isIOS() ? settings.iOSPosition : settings.position)}">
  {#each buttons as { title, icon, event }}
    <button
      class="toolbar-btn"
      aria-label={title}
      use:useSetIcon={icon}
      onclick={(e) => {
        if (event === "toggle-share-menu") {
          handleShareMenu(e);
        } else {
          emitEvent(event);
        }
      }}
    ></button>
  {/each}

  <button
    class="toolbar-btn {buttonClass}"
    class:disabled={isprotected}
    aria-label="保存"
    bind:this={saveBtnEl}
    use:useSetSaveIcon
    onclick={() => emitEvent("save")}
  ></button>
</div>

<style>
  .toolbar-container.bottom {
    display: flex;
    flex-direction: row;
    gap: 4px;
  }

  .toolbar-container.right {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toolbar-btn {
    border: none;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      transform 0.1s ease;
  }

  /* === 状态颜色 === */
  .toolbar-btn.empty {
    background-color: hsl(33, 5%, 57%);
  }

  .toolbar-btn.saved {
    background-color: hsl(122, 39%, 49%);
  }

  .toolbar-btn.unsaved {
    background-color: hsl(35, 100%, 50%);
  }

  .toolbar-btn.disabled {
    pointer-events: none;
    opacity: 0.5;
  }
</style>
