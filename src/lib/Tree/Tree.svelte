<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { EventBus } from "../../core/event-bus";
  import { PIECE_CHARS, type ChessNode, type NodeMap } from "../../types";
  import { calculateTreeLayout } from "./layout";
  import { setIcon } from "obsidian";
  import * as d3 from "d3";
  import { isIOS } from "../../utils/device";

  interface Props {
    nodeMap: NodeMap;
    eventBus: EventBus;
    currentNode: ChessNode | null;
    currentPath: string[];
    settings: any;
  }

  let { nodeMap, eventBus, currentNode = $bindable(), currentPath, settings }: Props = $props();

  // ---- 状态 ----
  let commentsText = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let svgEl: SVGSVGElement | undefined = $state();
  let renderedNodes: ChessNode[] = $state([]);
  let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown>;
  let zoomTransform = $state(d3.zoomIdentity);

  // 缩放步长（用于按钮）
  const ZOOM_STEP = 1.15;

  // 在 SVG 中心处按 factor 缩放，同时保持屏幕中心对应的世界坐标不变
  function zoomAtCenter(factor: number) {
    if (!svgEl) return;

    const w = svgEl.clientWidth;
    const h = svgEl.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    let { x: translateX, y: translateY, k: scale } = zoomTransform;
    const prev = scale;
    const next = prev * factor;
    const worldX = (cx - translateX) / prev;
    const worldY = (cy - translateY) / prev;
    scale = next;
    translateX = cx - worldX * scale;
    translateY = cy - worldY * scale;
    const t = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    d3.select(svgEl).transition().duration(200).call(zoomBehavior.transform, t);
  }

  function zoomIn() {
    zoomAtCenter(ZOOM_STEP);
  }
  function zoomOut() {
    zoomAtCenter(1 / ZOOM_STEP);
  }

  function resetView() {
    updateTreeLayout();
    tick().then(centerAndFit);
  }

  // ---- 常量 ----
  let currentCellSize = $derived(isIOS() ? (settings?.iOSCellSize || 40) : (settings?.cellSize || 50));
  let spacingX = $derived(currentCellSize * 0.44);
  let spacingY = $derived(currentCellSize * 0.3);
  let width = $derived(currentCellSize * 0.26);
  let height = $derived(currentCellSize * 0.22);
  const lucide_message_square_text = `<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>`;
  const lucide_thumbs_up = `<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>`;
  const lucide_thumbs_down = `<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/><path d="M17 14V2"/>`;
  const lucide_handshake = `<path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"/>`;
  const lucide_bookmark = `<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`;
  const lucide_star = `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`;
  const lucide_bug = `<path d="M8 2v2.079a4.93 4.93 0 0 1 3 4.554 4.93 4.93 0 0 1-3 4.554V16a2 2 0 0 1 2 2h2a2 2 0 0 1 2-2v-2.813a4.93 4.93 0 0 1 3-4.554 4.93 4.93 0 0 1-3-4.554V2a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2m1 0h2v2H9zm-4 5v6h2V7zm10 0v6h2V7z"/>`;
  const lucide_bow_arrow = `<path d="M17 3h4v4"/><path d="M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17"/><path d="M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05"/><path d="M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z"/><path d="M9.707 14.293 21 3"/>`;
  const ANNOTATION_DEFINITIONS: Record<string, { symbol: string; color: string; icon?: string }> = {
    "R+": { symbol: "红优", color: "#ff6fb1", icon: lucide_thumbs_up },
    "B+": { symbol: "黑优", color: "#2ab3ff", icon: lucide_thumbs_down },
    "=": { symbol: "均势", color: "#7fe38a", icon: lucide_handshake },
    "?": { symbol: "问题", color: "var(--text-warning)", icon: lucide_bookmark },
    "!": { symbol: "妙手", color: "var(--color-yellow)", icon: lucide_star },
    "?!": { symbol: "骗着", color: "var(--color-purple)", icon: lucide_bow_arrow },
    "R#": { symbol: "红胜", color: "red", icon: lucide_thumbs_up },
    "B#": { symbol: "黑胜", color: "black", icon: lucide_thumbs_up },
    "=#": { symbol: "和棋", color: "gray", icon: lucide_handshake },
  };

  const ALL_ANNOTATION_KEYS = Object.keys(ANNOTATION_DEFINITIONS);

  function getPrimaryAnnotation(node: ChessNode): string | undefined {
    if (!node.comments) return undefined;
    return node.comments.find((c) => ALL_ANNOTATION_KEYS.includes(c));
  }

  function getAllAnnotations(node: ChessNode): string[] {
    return node.comments?.filter((c) => ALL_ANNOTATION_KEYS.includes(c)) ?? [];
  }

  function getRegularComments(node: ChessNode): string[] {
    return node.comments?.filter((c) => !ALL_ANNOTATION_KEYS.includes(c) && !c.startsWith("flag-")) ?? [];
  }

  function getPathColor(node: ChessNode): string | undefined {
    if (!node.comments) return undefined;
    return node.comments.find((c) => c.startsWith("flag-"));
  }

  // 提取所有路径段（两个分叉点之间，或分叉点到终点）
  // 分叉点同时属于上一段的终点和下一段的起点，但分叉点的颜色只属于上一段
  function extractPathSegments(nodeMap: NodeMap): Array<{ nodes: ChessNode[]; startId: string; endId: string }> {
    const segments: Array<{ nodes: ChessNode[]; startId: string; endId: string }> = [];
    
    function dfs(currentId: string, currentPath: ChessNode[]): void {
      const node = nodeMap.get(currentId);
      if (!node) return;
      
      const newPath = [...currentPath, node];
      
      // 判断是否是终点（分叉点或叶子节点）
      const isFork = node.children.length > 1;
      const isLeaf = node.children.length === 0;
      
      if (isFork || isLeaf) {
        // 这是一段完整的路径
        if (newPath.length > 0) {
          segments.push({
            nodes: newPath,
            startId: newPath[0].id,
            endId: currentId
          });
        }
        
        // 如果是分叉点，继续处理每个子路径（从分叉点开始，但分叉点的颜色不计入）
        if (isFork) {
          for (const child of node.children) {
            dfs(child.id, [node]);  // 新路径段包含分叉点
          }
        }
      } else {
        // 继续向下（只有一个子节点）
        if (node.children.length === 1) {
          dfs(node.children[0].id, newPath);
        }
      }
    }
    
    // 从根节点开始
    const rootId = Array.from(nodeMap.keys()).find(id => {
      const node = nodeMap.get(id);
      return node && !node.parentID;
    });
    
    if (rootId) {
      dfs(rootId, []);
    }
    
    return segments;
  }

  // 计算所有边的颜色（基于路径段）
  function calculateAllEdgeColors(nodeMap: NodeMap): Map<string, string> {
    const edgeColorMap = new Map<string, string>(); // key: "fromId-toId", value: color
    const segments = extractPathSegments(nodeMap);
    
    for (const segment of segments) {
      // 收集该段的所有标记点（按深度顺序，不考虑颜色）
      // 但是如果节点是分叉点且不是段的终点，则跳过（分叉点的颜色只属于上一段）
      const markers: Array<{ nodeId: string; color: string; step: number }> = [];
      for (let i = 0; i < segment.nodes.length; i++) {
        const node = segment.nodes[i];
        const isFork = node.children.length > 1;
        const isEndOfSegment = (i === segment.nodes.length - 1);
        
        // 如果节点是分叉点且不是段的终点，跳过它的颜色（属于上一段）
        if (isFork && !isEndOfSegment) {
          continue;
        }
        
        const colorComment = getPathColor(node);
        if (colorComment) {
          markers.push({
            nodeId: node.id,
            color: colorComment,
            step: node.step || 0
          });
        }
      }
      
      // 按 step 排序（深度优先顺序，所有颜色混排）
      markers.sort((a, b) => a.step - b.step);
      
      // 配对处理：按标记顺序配对，不是按颜色配对
      // 第 1 个和第 2 个配对，第 3 个和第 4 个配对，以此类推
      for (let i = 0; i < markers.length; i += 2) {
        const startMarker = markers[i];
        
        if (i + 1 < markers.length) {
          // 成对：第 i 个（奇数位置）到第 i+1 个（偶数位置）
          // 颜色由第 i 个标记决定
          const endMarker = markers[i + 1];
          const pathNodes = getPathBetweenNodes(segment.nodes, startMarker.nodeId, endMarker.nodeId);
          
          // 为路径上的每条边设置颜色（由第 i 个标记的颜色决定）
          for (let j = 0; j < pathNodes.length - 1; j++) {
            const edgeKey = `${pathNodes[j].id}-${pathNodes[j + 1].id}`;
            edgeColorMap.set(edgeKey, startMarker.color);
          }
        } else {
          // 最后一个奇数点
          if (markers.length === 1) {
            // 只有 1 个点：向上穿透到段起点
            const startIndex = segment.nodes.findIndex(n => n.id === startMarker.nodeId);
            for (let j = 0; j < startIndex; j++) {
              const edgeKey = `${segment.nodes[j].id}-${segment.nodes[j + 1].id}`;
              edgeColorMap.set(edgeKey, startMarker.color);
            }
          } else {
            // 3 个以上奇数：最后一个向下穿透到段终点
            const startIndex = segment.nodes.findIndex(n => n.id === startMarker.nodeId);
            for (let j = startIndex; j < segment.nodes.length - 1; j++) {
              const edgeKey = `${segment.nodes[j].id}-${segment.nodes[j + 1].id}`;
              edgeColorMap.set(edgeKey, startMarker.color);
            }
          }
        }
      }
    }
    
    return edgeColorMap;
  }

  // 获取路径段中两个节点之间的路径
  function getPathBetweenNodes(nodes: ChessNode[], startId: string, endId: string): ChessNode[] {
    const startIndex = nodes.findIndex(n => n.id === startId);
    const endIndex = nodes.findIndex(n => n.id === endId);
    
    if (startIndex === -1 || endIndex === -1) return [];
    
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    
    return nodes.slice(start, end + 1);
  }

  // 使用 $derived 缓存边颜色计算结果
  let edgeColorCache = $derived.by(() => {
    return calculateAllEdgeColors(nodeMap);
  });

  function getEdgePathColor(parentNode: ChessNode, childNode: ChessNode, nodeMap: NodeMap): string | undefined {
    const edgeKey = `${parentNode.id}-${childNode.id}`;
    return edgeColorCache.get(edgeKey);
  }

  let saveTimeout: number | undefined;

  function handleCommentsInput() {
    adjustTextareaHeight();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      saveComments();
      saveTimeout = undefined;
    }, 700);
  }

  onDestroy(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = undefined;
    }
  });

  function handleCommentsBlur() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = undefined;
    }
    saveComments();
  }

  function saveComments() {
    if (!currentNode) return;
    const regularComments = commentsText.split("\n").filter((c) => c.trim() !== "");
    const existingAnnotations = getAllAnnotations(currentNode);
    currentNode.comments = [...existingAnnotations, ...regularComments];
    eventBus.emit("updateUI", null);
    eventBus.emit("updatePGN", null);
  }

  function adjustTextareaHeight() {
    if (!textareaEl) return;
    textareaEl.classList.add("auto-height");
    const minHeight = settings.commentsBoxHeight || 200;
    const maxHeight = minHeight * 1.5;
    const contentHeight = textareaEl.scrollHeight;
    const height = Math.min(Math.max(minHeight, contentHeight), maxHeight);
    textareaEl.style.setProperty("--textarea-height", `${height}px`);
    textareaEl.classList.remove("auto-height");
  }

  function updateTreeLayout() {
    renderedNodes = calculateTreeLayout(nodeMap);
  }

  function centerAndFit() {
    if (!svgEl || renderedNodes.length === 0) return;

    const { clientWidth, clientHeight } = svgEl;
    const padding = 40;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const n of renderedNodes) {
      minX = Math.min(minX, n.x!);
      maxX = Math.max(maxX, n.x!);
      minY = Math.min(minY, n.y!);
      maxY = Math.max(maxY, n.y!);
    }

    const treeWidth = (maxX - minX) * spacingX;
    const treeHeight = (maxY - minY) * spacingY;

    const scaleX = (clientWidth - padding * 2) / treeWidth;
    const scaleY = (clientHeight - padding * 2) / treeHeight;
    const k = Math.max(0.75, Math.min(scaleX, scaleY, 2));

    const treeCenterX = minX * spacingX + treeWidth / 2;
    const treeTopY = minY * spacingY;
    const tx = clientWidth / 2 - treeCenterX * k;
    const ty = padding - treeTopY * k;

    const t = d3.zoomIdentity.translate(tx, ty).scale(k);
    d3.select(svgEl).transition().duration(300).call(zoomBehavior.transform, t);
  }

  function panToNodeIfNeeded(node: ChessNode) {
    if (!node || !svgEl || node.x === undefined || node.y === undefined) return;
    const { clientWidth, clientHeight } = svgEl;
    const padding = 50;
    let { x: translateX, y: translateY, k: scale } = zoomTransform;
    const nodeScreenX = node.x * spacingX * scale + translateX;
    const nodeScreenY = node.y * spacingY * scale + translateY;

    let dx = 0, dy = 0;
    if (nodeScreenX < padding) dx = padding - nodeScreenX;
    else if (nodeScreenX > clientWidth - padding) dx = clientWidth - padding - nodeScreenX;

    if (nodeScreenY < padding) dy = padding - nodeScreenY;
    else if (nodeScreenY > clientHeight - padding) dy = clientHeight - padding - nodeScreenY;

    if (dx || dy) {
      translateX += dx;
      translateY += dy;
    }
    const t = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    d3.select(svgEl).transition().duration(300).call(zoomBehavior.transform, t);
  }

  const zoomBTN = [
    { title: "放大", icon: "plus", event: zoomIn },
    { title: "缩小", icon: "minus", event: zoomOut },
    { title: "重置", icon: "rotate-ccw", event: resetView },
  ];

  function useSetIcon(el: HTMLElement, icon: string) {
    setIcon(el, icon);
  }

  function handleTreeKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;

    let action: string | null = null;
    switch (e.key) {
      case "ArrowLeft":
        action = "back";
        break;
      case "ArrowRight":
        action = "next";
        break;
      case "ArrowUp":
        action = "prevVariation";
        break;
      case "ArrowDown":
        action = "nextVariation";
        break;
      default:
        break;
    }

    if (action) {
      e.preventDefault();
      eventBus.emit("btn-click", { name: action, payload: null });
      return;
    }

    // Number keys: switch to a specific branch when current node is a fork.
    if (currentNode && currentNode.children?.length > 1) {
      const idx = Number(e.key);
      if (Number.isInteger(idx) && idx >= 1 && idx <= currentNode.children.length) {
        e.preventDefault();
        const targetNode = currentNode.children[idx - 1];
        if (targetNode) {
          eventBus.emit("node-click", targetNode.id);
        }
      }
    }
  }

  onMount(() => {
    if (!svgEl) return;

    updateTreeLayout();

    zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on("zoom", (event) => {
        zoomTransform = event.transform;
      });

    d3.select(svgEl).call(zoomBehavior);

    tick().then(centerAndFit);
  });

  $effect(() => {
    if (!currentNode) {
      commentsText = "";
      return;
    }

    const node = currentNode;
    commentsText = getRegularComments(node).join("\n");

    tick().then(() => {
      if (textareaEl) adjustTextareaHeight();
      panToNodeIfNeeded(node);
    });
  });

  $effect(() => {
    nodeMap.size;
    updateTreeLayout();
  });
</script>

<div class="tree-container">
  <div class="svg-wrapper" tabindex="0" onkeydown={handleTreeKeydown}>
    <svg
      bind:this={svgEl}
      width="100%"
      height="100%"
      class="tree-svg"
    >
      <g transform={zoomTransform.toString()}>
        {#each renderedNodes as node}
          {#each node.children as child}
            {@const pathColor = getEdgePathColor(node, child, nodeMap)}
            {@const isColoredPath = !!pathColor}
            <path
              d={`
              M ${node.x! * spacingX} ${node.y! * spacingY}
              L ${(child.x! - 0.3 * Math.sign(child.x! - node.x!)) * spacingX} ${node.y! * spacingY}
              L ${child.x! * spacingX} ${child.y! * spacingY}
              `}
              stroke={isColoredPath ? (pathColor === 'flag-red' ? '#ff4444' : pathColor === 'flag-green' ? '#44ff44' : pathColor === 'flag-blue' ? '#4488ff' : pathColor === 'flag-yellow' ? '#ffff44' : 'var(--board-line)') : 'var(--board-line)'}
              stroke-linejoin="round"
              stroke-width={currentPath.includes(node.id) && currentPath.includes(child.id) ? 2 : 1}
              opacity={currentPath.includes(node.id) && currentPath.includes(child.id) ? 1.5 : 0.7}
              filter={currentPath.includes(node.id) && currentPath.includes(child.id)
                ? "brightness(1.5) saturate(1.4) drop-shadow(0 0 1px rgba(255, 255, 255, 0.6))"
                : isColoredPath
                  ? "none"
                  : "grayscale(50%) brightness(0.75)"}
              fill="none"
            />
          {/each}
        {/each}

        {#each renderedNodes as node (node.id)}
          {@const primaryAnnotation = getPrimaryAnnotation(node)}
          <g
            class="node-group"
            transform="translate({node.x! * spacingX} {node.y! * spacingY})"
            opacity={currentPath.includes(node.id) ? 1 : 0.8}
            stroke-width={node.id === currentNode?.id ? height * 0.09 : height * 0.045}
            onclick={() => eventBus.emit("node-click", node.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                eventBus.emit("node-click", node.id);
              }
            }}
            role="button"
            tabindex="0"
          >
            <rect
              x={-width / 2}
              y={-height / 2}
              {width}
              {height}
              rx="2.5"
              ry="2.5"
              fill={currentPath.includes(node.id) || !node.data
                ? (node.side === "red"
                  ? "var(--piece-red)"
                  : node.side === "black"
                    ? "var(--piece-black)"
                    : "green")
                : "gray"}
              stroke={node.id === currentNode?.id ? "green" : "var(--board-line)"}
              stroke-width={node.id === currentNode?.id ? height * 0.18 : height * 0.09}
            />
            <text dy={height * 0.32} text-anchor="middle" fill="white" font-size={height * 0.8}>
              {node.data?.type ? PIECE_CHARS[node.data.type] : "始"}
            </text>

            {#if primaryAnnotation}
              {@const def = ANNOTATION_DEFINITIONS[primaryAnnotation]}
              <g
                transform={`translate(${width * 0.3} ${-height * 0.7}) scale(${height * 0.04})`}
                fill={def.color}
                stroke="currentColor"
                stroke-width={height * 0.15}
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                {@html def.icon}
              </g>
            {/if}

            {#if getRegularComments(node).length > 0}
              {@const hasAnnotation = !!primaryAnnotation}
              <g
                transform={`translate(${hasAnnotation ? 0.1 * width : 0.35 * width} ${-0.7 * height}) scale(${height * 0.03})`}
                fill="royalblue"
                stroke="currentColor"
                stroke-width={height * 0.15}
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                {@html lucide_message_square_text}
              </g>
            {/if}
          </g>
        {/each}
      </g>
    </svg>
    <div class="toolbar">
      {#each zoomBTN as { title, icon, event }}
        <button class="toolbar-btn" aria-label={title} use:useSetIcon={icon} onclick={event}
        ></button>
      {/each}
    </div>
  </div>

  <textarea
    bind:value={commentsText}
    class="auto-height"
    placeholder="添加注释"
    bind:this={textareaEl}
    oninput={handleCommentsInput}
    onblur={handleCommentsBlur}
    rows="10"
    style="--min-textarea-height: {settings.commentsBoxHeight}px; --max-textarea-height: {settings.commentsBoxHeight * 1.5}px;"
  ></textarea>
</div>

<style>
  .tree-container {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    height: 100%;
    max-height: 100vh;
    overflow: hidden;
    --board-background: var(--background-primary-alt);
    --board-line: var(--text-normal);
    --piece-red: var(--xq-piece-red, var(--color-red));
    --piece-black: var(--xq-piece-black, var(--color-blue));
    --text-color: var(--text-normal);
  }

  .svg-wrapper {
    flex: 1 1 auto;
    overflow: hidden;
    background-color: var(--board-background);
    min-height: 0;
    position: relative;
    width: 100%;
    height: 100%;
  }

  .toolbar {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    gap: 0;
    margin: 0;
    padding: 0px;
  }

  .toolbar .toolbar-btn {
    font-size: large;
    width: 25px;
    height: 25px;
    padding: 0;
    margin: 0;
  }

  .tree-svg {
    user-select: none;
    touch-action: none;
    display: block;
  }

  .node-group {
    cursor: pointer;
  }

  textarea {
    width: 100%;
    height: var(--textarea-height, var(--min-textarea-height, 200px));
    max-height: var(--max-textarea-height, var(--min-textarea-height, 300px));
    resize: none;
    font-family: var(--font-family);
    font-size: var(--font-size-normal);
    color: var(--text-normal);
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    padding: 4px 8px;
    outline: none;
    overflow-y: auto;
  }
  textarea.auto-height {
    height: auto;
  }
  textarea:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 5px var(--interactive-accent);
  }
</style>
