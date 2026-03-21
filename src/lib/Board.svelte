<script lang="ts">
  import type { EventBus } from "../core/event-bus";
  import type { IBoard, IMove, IPosition, ISettings } from "../types";
  import { PIECE_CHARS } from "../types";
  import { isIOS } from "../utils/device";

  import type { ICloudMove } from "../types";

  interface Props {
    settings: ISettings;
    board: IBoard;
    lastMove?: IMove | null;
    markedPos?: IPosition | null;
    currentTurn: string;
    eventBus: EventBus;
    rotated: boolean;
    variations?: IMove[];
    currentMove?: IMove | null;
    cloudMoves?: ICloudMove[];
    showCloudMoves?: boolean;
  }

  let {
    settings,
    board,
    lastMove = null,
    markedPos = null,
    currentTurn,
    eventBus,
    rotated,
    variations = [],
    currentMove = null,
    cloudMoves = [],
    showCloudMoves = false,
  }: Props = $props();

  let Bnum = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  let Rnum = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  let TopNum: string[] = $state([]);
  let BotNum: string[] = $state([]);

  $effect(() => {
    if (rotated) {
      TopNum = Rnum;
      BotNum = Bnum.reverse();
    } else {
      TopNum = Bnum;
      BotNum = [...Rnum].reverse();
    }
  });

  let renderedBoard: IBoard = $derived(rotated ? rotateBoard(board) : board);
  let renderedMarkedPos: IPosition | null = $derived(
    rotated && markedPos ? rotatePos(markedPos) : markedPos,
  );

  let { showLastMove, showTurnBorder, showCoordinateLabels, showAnnotationsOnBoard } = $derived(settings);
  let cellSize = $derived(isIOS() ? settings.iOSCellSize : settings.cellSize);
  let boardMarginTop = $derived(isIOS() ? settings.iOSBoardMarginTop : settings.boardMarginTop);
  let boardMarginBottom = $derived(isIOS() ? settings.iOSBoardMarginBottom : settings.boardMarginBottom);
  let margin = $derived(cellSize * 0.1);
  let width = $derived(cellSize * 10);
  let height = $derived(cellSize * 11);

  function rotatePos(pos: IPosition): IPosition {
    return { x: 8 - pos.x, y: 9 - pos.y };
  }
  
  // 为云库着法生成颜色，确保在深色背景下清晰可见，并且与用户分支颜色区分
    function adjustColor(baseColor: string, index: number): string {
      // 预定义一组在深色背景下清晰可见的颜色，避免深蓝色、绿色和薄荷绿，防止与用户分支撞色
      const predefinedColors = [
        '#FF6B35', // 橙色
        '#FFD23F', // 黄色
        '#4ECDC4', // 青色
        '#9B5DE5', // 紫色
        '#F15BB5', // 粉色
        '#00BBF9', // 浅蓝色
        '#FF9E00', // 深橙色
        '#C77DFF'  // 浅紫色
      ];
      
      // 循环使用预定义颜色
      return predefinedColors[index % predefinedColors.length];
    }
  
  // 线段交叉检测函数
  function doLineSegmentsIntersect(p1: {x: number, y: number}, p2: {x: number, y: number}, p3: {x: number, y: number}, p4: {x: number, y: number}) {
    // 计算线段p1-p2和p3-p4是否相交
    const ccw = (p: {x: number, y: number}, q: {x: number, y: number}, r: {x: number, y: number}) => {
      return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y) > 0;
    };
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
  }

  function rotateBoard(board: IBoard): IBoard {
    const newBoard: IBoard = Array.from({ length: 9 }, () => Array(10).fill(null));
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 10; y++) {
        newBoard[x][y] = board[8 - x][9 - y];
      }
    }
    return newBoard;
  }

  let renderedLastMove = $derived(
    rotated && lastMove ? { from: rotatePos(lastMove.from), to: rotatePos(lastMove.to) } : lastMove,
  );
  
  let renderedCurrentMove = $derived(
    rotated && currentMove ? { ...currentMove, to: rotatePos(currentMove.to) } : currentMove,
  );

  // 着法颜色数组 - 使用设置中的分支颜色
  const colors = $derived(
    Array(10).fill(settings.branchColor)
  );

  function handleClick(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const boardRect = svg.getBoundingClientRect();

    // 获取SVG的实际渲染宽度和高度
    const actualWidth = svg.clientWidth;
    const actualHeight = svg.clientHeight;

    // 计算实际的单元格大小
    const actualCellSize = actualWidth / 10; // 棋盘有10列（1-9，加上边框）

    // 计算鼠标在SVG内部的相对坐标
    const mouseX = e.clientX - boardRect.left;
    const mouseY = e.clientY - boardRect.top - (actualHeight - (actualWidth * 11) / 10) / 2; // 调整Y坐标以适应宽高比

    // 根据实际单元格大小计算网格坐标
    let gridX = Math.round(mouseX / actualCellSize) - 1;
    let gridY = Math.round(mouseY / actualCellSize) - 1;

    if (gridX >= 0 && gridX < 9 && gridY >= 0 && gridY < 10) {
      const pos = rotated ? rotatePos({ x: gridX, y: gridY }) : { x: gridX, y: gridY };
      eventBus.emit("click", pos);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="board-container" style={`--board-margin-top: ${boardMarginTop}; --board-margin-bottom: ${boardMarginBottom};`}>
  <svg {width} {height} viewBox={`0 0 ${width} ${height}`} class="xq-board" onclick={handleClick}>
    <!-- 背景 -->
    <rect
      x={cellSize * 0.1}
      y={cellSize * 0.1}
      width={width - cellSize * 0.2}
      height={height - cellSize * 0.2}
      fill="var(--board-background)"
      rx="5"
      stroke={showTurnBorder
        ? currentTurn === "red"
          ? "var(--piece-red)"
          : "var(--piece-black)"
        : "var(--background-modifier-border)"}
      stroke-width={cellSize * 0.1}
    />

    <!-- 外框 -->
    <path
      d={`M ${cellSize - margin},${cellSize - margin} h ${8 * cellSize + 2 * margin} v ${9 * cellSize + 2 * margin} h -${8 * cellSize + 2 * margin} Z`}
      stroke="var(--board-line)"
      stroke-width={cellSize * 0.08}
      fill="none"
    />
    <!-- 内框 -->
    <path
      d={`M ${cellSize},${cellSize} h ${8 * cellSize} v ${9 * cellSize} h -${8 * cellSize} Z`}
      stroke="var(--board-line)"
      stroke-width={cellSize * 0.04}
      fill="none"
    />

    <!-- 横线 -->
    {#each Array(8).fill(0) as _, i}
      <path
        d={`M ${cellSize},${cellSize * (i + 2)} h ${cellSize * 8}`}
        stroke="var(--board-line)"
        stroke-width={cellSize * 0.03}
        fill="none"
      />
    {/each}

    <!-- 上/下竖线 -->
    {#each Array(7).fill(0) as _, i}
      <path
        d={`M ${cellSize * (i + 2)},${cellSize} v ${cellSize * 4}`}
        stroke="var(--board-line)"
        stroke-width={cellSize * 0.03}
        fill="none"
      />
      <path
        d={`M ${cellSize * (i + 2)},${cellSize * 6} v ${cellSize * 4}`}
        stroke="var(--board-line)"
        stroke-width={cellSize * 0.04}
        fill="none"
      />
    {/each}

    <!-- 楚河汉界 -->
    {#each [["楚", 1.9], ["河", 3.1], ["漢", 5.9], ["界", 7.1]] as [char, pos]}
      <text
        x={(+pos + 0.5) * cellSize}
        y={height / 2}
        font-size={cellSize * 0.6}
        text-anchor="middle"
        dominant-baseline="middle"
        fill="var(--board-line)"
      >
        <tspan dy="0.15em">{char}</tspan>
      </text>
    {/each}

    <!-- 九宫 -->
    <g stroke="var(--board-line)" stroke-width={cellSize * 0.02} fill="none">
      <path
        d={`M ${cellSize * 4},${cellSize} l ${cellSize * 2} ${cellSize * 2} m 0,${-2 * cellSize} l ${-2 * cellSize} ${2 * cellSize}`}
      />
      <path
        d={`M ${cellSize * 4},${8 * cellSize} l ${cellSize * 2} ${cellSize * 2} m 0,${-2 * cellSize} l ${-2 * cellSize} ${2 * cellSize}`}
      />
    </g>

    <!-- 炮兵位 -->
    <g stroke="var(--board-line)" stroke-width={cellSize * 0.03} fill="none">
      {#each [[2, 3], [8, 3], [2, 8], [8, 8], [3, 4], [5, 4], [7, 4], [3, 7], [7, 7], [5, 7]] as i}
        <path
          d={`M ${i[0] * cellSize},${i[1] * cellSize} m -${3 * margin},-${margin} h ${2 * margin} v -${2 * margin} m ${2 * margin},0 v ${2 * margin} h ${2 * margin} m 0,${2 * margin} h -${2 * margin} v ${2 * margin} m -${2 * margin},0 v -${2 * margin} h -${2 * margin}`}
        />
      {/each}
      {#each [[1, 4], [1, 7]] as i}
        <path
          d={`M ${i[0] * cellSize},${i[1] * cellSize} m ${margin},-${3 * margin} v ${2 * margin} h ${2 * margin} m 0,${2 * margin} h -${2 * margin} v ${2 * margin}`}
        />
      {/each}
      {#each [[9, 4], [9, 7]] as i}
        <path
          d={`M ${i[0] * cellSize},${i[1] * cellSize} m -${3 * margin},-${margin} h ${2 * margin} v -${2 * margin} m 0,${6 * margin} v -${2 * margin} h -${2 * margin}`}
        />
      {/each}
    </g>

    <!-- 坐标标签 -->
    {#if showCoordinateLabels}
      <g text-anchor="middle" dominant-baseline="middle" fill="var(--text-color)">
        <g font-size={rotated === true ? cellSize * 0.25 : cellSize * 0.33}>
          {#each TopNum as num, i}
            <text x={(i + 1) * cellSize} y={3.5 * margin}>
              <tspan dy="0.15em">{num}</tspan>
            </text>
          {/each}
        </g>
        <g font-size={rotated === true ? cellSize * 0.33 : cellSize * 0.25}>
          {#each BotNum as num, i}
            <text x={(i + 1) * cellSize} y={height - 3.5 * margin}>
              <tspan dy="0.15em">{num}</tspan>
            </text>
          {/each}</g
        >
      </g>
    {/if}

    <!-- 棋子 -->
    <g id="xiangqi-pieces">
      {#each renderedBoard as row, x}
        {#each row as piece, y}
          {#if piece}
            <g transform="translate({(x + 1) * cellSize}, {(y + 1) * cellSize})">
              <circle
                r={cellSize * 0.45}
                fill={piece === piece.toUpperCase() ? "var(--piece-red)" : "var(--piece-black)"}
                stroke="var(--board-line)"
                stroke-width={cellSize * 0.03}
              />
              <text
                x="0"
                y="0"
                fill="white"
                font-size={cellSize * 0.55}
                text-anchor="middle"
                dy="0.4em"
              >
                {PIECE_CHARS[piece as keyof typeof PIECE_CHARS]}
              </text>
              <!-- 旗标显示 -->
              {#if showAnnotationsOnBoard && renderedCurrentMove && renderedCurrentMove.to && renderedCurrentMove.to.x === x && renderedCurrentMove.to.y === y && renderedCurrentMove.comments && renderedCurrentMove.comments.length > 0}
                {#each renderedCurrentMove.comments as comment, commentIndex}
                  {@const isFlag = comment.startsWith("flag-") || ["?!", "!", "?", "R+", "B+", "=", "R#", "B#"].includes(comment)}
                  {@const displayText = comment === "flag-red" ? "R"
                    : comment === "flag-blue" ? "B"
                      : comment === "flag-yellow" ? "Y"
                        : comment === "flag-green" ? "G"
                          : comment === "?!" ? "骗"
                            : comment === "!" ? "妙"
                              : comment === "?" ? "关"
                                : comment === "R+" ? "优"
                                  : comment === "B+" ? "劣"
                                    : comment === "=" ? "均"
                                      : comment === "R#" ? "红胜"
                                        : comment === "B#" ? "黑胜"
                                          : comment}
                  {@const lines = displayText.split('\n')}
                  {@const lineCount = lines.length}
                  {@const fontSize = cellSize * (isFlag ? 0.2 : 0.12)}
                  {@const circleRadius = cellSize * (isFlag ? 0.15 : Math.max(0.15, 0.08 * lineCount + 0.1))}
                  {@const offsetY = cellSize * 0.25 + commentIndex * cellSize * 0.35}
                  <g transform="translate({cellSize * 0.25}, {-offsetY})">
                    <circle
                      r={circleRadius}
                      fill="var(--color-accent)"
                      stroke="white"
                      stroke-width={cellSize * 0.02}
                    />
                    <text
                      x="0"
                      y={isFlag ? 0 : -fontSize * (lineCount - 1) / 2}
                      fill="white"
                      font-size={fontSize}
                      text-anchor="middle"
                      dominant-baseline="middle"
                      font-weight="bold"
                    >
                      {#if isFlag}
                        {displayText}
                      {:else}
                        {#each lines as line, lineIndex}
                          <tspan
                            x="0"
                            dy={lineIndex === 0 ? 0 : fontSize * 1.2}
                            text-anchor="middle"
                          >{line}</tspan>
                        {/each}
                      {/if}
                    </text>
                  </g>
                {/each}
              {/if}
            </g>
          {/if}
        {/each}
      {/each}
    </g>

    <!-- 分支线路 -->
    {#if variations && variations.length > 1}
      <!-- 按位置分组着法 -->
      {@const movesByPosition = variations.filter(m => m.from && m.to).reduce((acc, move) => {
        const to = rotated ? rotatePos(move.to) : move.to;
        const positionKey = `${to.x},${to.y}`;
        if (!acc[positionKey]) {
          acc[positionKey] = [];
        }
        acc[positionKey].push(move);
        return acc;
      }, {} as Record<string, typeof variations>)}
      <!-- 按起点分组着法 -->
      {@const movesByStartPosition = variations.filter(m => m.from && m.to).reduce((acc, move) => {
        const from = rotated ? rotatePos(move.from) : move.from;
        const startKey = `${from.x},${from.y}`;
        if (!acc[startKey]) {
          acc[startKey] = [];
        }
        acc[startKey].push(move);
        return acc;
      }, {} as Record<string, typeof variations>)}
      <!-- 检测路线交叉 -->
      {@const movesWithIntersections = variations.filter((move, index) => {
        if (!move.from || !move.to) return false;
        const from = rotated ? rotatePos(move.from) : move.from;
        const to = rotated ? rotatePos(move.to) : move.to;
        const p1 = {x: (from.x + 1) * cellSize, y: (from.y + 1) * cellSize};
        const p2 = {x: (to.x + 1) * cellSize, y: (to.y + 1) * cellSize};
        
        // 检查与之前的着法是否交叉，或路径经过其他着法的终点
        for (let i = 0; i < index; i++) {
          const otherMove = variations[i];
          if (!otherMove.from || !otherMove.to) continue;
          const otherFrom = rotated ? rotatePos(otherMove.from) : otherMove.from;
          const otherTo = rotated ? rotatePos(otherMove.to) : otherMove.to;
          const p3 = {x: (otherFrom.x + 1) * cellSize, y: (otherFrom.y + 1) * cellSize};
          const p4 = {x: (otherTo.x + 1) * cellSize, y: (otherTo.y + 1) * cellSize};
          
          // 检查线路交叉
          if (doLineSegmentsIntersect(p1, p2, p3, p4)) {
            return true;
          }
          
          // 检查当前着法的路径是否经过其他着法的终点
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const otherToPoint = p4;
          
          // 计算其他着法终点到当前着法线路的距离
          const t = ((otherToPoint.x - p1.x) * dx + (otherToPoint.y - p1.y) * dy) / (distance * distance);
          const tClamped = Math.max(0, Math.min(1, t));
          const closestX = p1.x + tClamped * dx;
          const closestY = p1.y + tClamped * dy;
          const distToLine = Math.sqrt((otherToPoint.x - closestX) ** 2 + (otherToPoint.y - closestY) ** 2);
          
          // 如果距离小于一个棋子的大小，认为路径经过该终点
          if (distToLine < cellSize * 0.5) {
            return true;
          }
        }
        return false;
      })}
      
      <g id="variations">
        {#each variations as variation, index}
          <!-- 计算变着的起点和终点 -->
          {#if variation.from && variation.to}
            {@const from = rotated ? rotatePos(variation.from) : variation.from}
            {@const to = rotated ? rotatePos(variation.to) : variation.to}
            <!-- 计算起点和终点的坐标 -->
            {@const fromX = (from.x + 1) * cellSize}
            {@const fromY = (from.y + 1) * cellSize}
            {@const toX = (to.x + 1) * cellSize}
            {@const toY = (to.y + 1) * cellSize}
            
            <!-- 判断是否为主线路 -->
            {@const isMainLine = index === 0}
            <!-- 获取当前着法的颜色 -->
            {@const color = colors[index % colors.length]}
            
            <!-- 检查是否有重叠的着法 -->
            {@const positionKey = `${to.x},${to.y}`}
            {@const positionMoves = movesByPosition[positionKey] || []}
            {@const hasEndOverlap = positionMoves.length > 1}
            
            <!-- 检查是否有相同起点的着法（线重叠） -->
            {@const startKey = `${from.x},${from.y}`}
            {@const startMoves = movesByStartPosition[startKey] || []}
            {@const hasStartOverlap = startMoves.length > 1}
            <!-- 计算当前着法在起点分组中的索引 -->
            {@const startIndex = startMoves.indexOf(variation)}
            
            <!-- 检查是否有路线交叉 -->
            {@const hasIntersection = movesWithIntersections.includes(variation)}
            
            <!-- 综合判断是否有重叠或交叉 -->
            {@const hasOverlap = hasEndOverlap || hasIntersection}
            
            <!-- 计算线条终点（到达圆圈边缘） -->
            {@const dx = toX - fromX}
            {@const dy = toY - fromY}
            {@const distance = Math.sqrt(dx * dx + dy * dy)}
            {@const radius = cellSize * 0.35}
            {@const lineEndX = toX - (dx / distance) * radius}
            {@const lineEndY = toY - (dy / distance) * radius}
            
            <!-- 计算标签文本的对齐方式 -->
            {@const textAnchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'}
            {@const dominantBaseline = dy > 0 ? 'hanging' : dy < 0 ? 'baseline' : 'central'}
            
            {#if (hasOverlap && !isMainLine) || hasIntersection || (hasStartOverlap && startIndex > 0)}
              <!-- 有重叠且不是主线路，或路线交叉的着法，或起点相同且不是第一个的着法，使用弧线绘制 -->
              <!-- 计算弧线参数 -->
              {@const angle = Math.atan2(dy, dx)}
              <!-- 为起点相同的着法生成不同的弧线半径和方向 -->
              {@const arcRadius = hasStartOverlap ? Math.max(cellSize * 2, distance / 2) + (startIndex * cellSize) : Math.max(cellSize * 2, distance / 2)}
              {@const sweepFlag = hasStartOverlap && startIndex % 2 === 1 ? 0 : 1} <!-- 交替弧线方向 -->
              {@const arcCenterX = toX - Math.cos(angle) * arcRadius}
              {@const arcCenterY = toY - Math.sin(angle) * arcRadius}
              {@const startAngle = angle + Math.PI}
              {@const endAngle = angle}
              {@const largeArcFlag = 0}
              
              <!-- 绘制弧线 -->
              <path
                d={`M ${fromX} ${fromY} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${lineEndX} ${lineEndY}`}
                stroke={color}
                stroke-width={cellSize * 0.08}
                stroke-dasharray={isMainLine ? 'none' : `${cellSize * 0.2} ${cellSize * 0.1}`}
                opacity={0.7}
                fill="none"
                stroke-linecap="round"
              />
              
              <!-- 绘制着法终点标记 -->
              <circle
                cx={toX}
                cy={toY}
                r={cellSize * 0.35}
                stroke={color}
                stroke-width={cellSize * 0.08}
                fill="none"
                opacity={0.7}
              />
              
              {#if hasEndOverlap && !isMainLine}
                <!-- 只有终点有重叠且不是主线路的着法，才偏移标签 -->
                <!-- 朝向起点方向偏移标签 -->
                {@const overlapOffset = cellSize * 0.3}
                {@const overlapLabelX = toX - (dx / distance) * overlapOffset}
                {@const overlapLabelY = toY - (dy / distance) * overlapOffset}
                
                <!-- 为着法添加数字标记（沿着来源方向偏移） -->
                <g transform={`translate(${overlapLabelX}, ${overlapLabelY})`}>
                  <text
                    x="0"
                    y="0"
                    fill={color}
                    font-size={cellSize * 0.5}
                    text-anchor="end"
                    dominant-baseline="central"
                    opacity="0.9"
                    font-weight="bold"
                    style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                  >
                    {index + 1}
                  </text>
                </g>
              {:else}
                <!-- 终点没有重叠，标签不偏移，放在圆圈里 -->
                <!-- 为着法添加数字标记（在圆圈里，不偏移） -->
                <g transform={`translate(${toX}, ${toY})`}>
                  <text
                    x="0"
                    y="0"
                    fill={color}
                    font-size={cellSize * 0.5}
                    text-anchor="middle"
                    dominant-baseline="central"
                    opacity="0.9"
                    font-weight="bold"
                    style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                  >
                    {index + 1}
                  </text>
                </g>
              {/if}
            {:else}
              <!-- 没有重叠或主线路，使用直线绘制，标签放在圆圈里 -->
              <!-- 绘制着法线路 -->
              <line
                x1={fromX}
                y1={fromY}
                x2={lineEndX}
                y2={lineEndY}
                stroke={color}
                stroke-width={cellSize * 0.08}
                stroke-dasharray={isMainLine ? 'none' : `${cellSize * 0.2} ${cellSize * 0.1}`}
                opacity={0.7}
                stroke-linecap="round"
              />
              <!-- 绘制着法终点标记 -->
              <circle
                cx={toX}
                cy={toY}
                r={cellSize * 0.35}
                stroke={color}
                stroke-width={cellSize * 0.08}
                fill="none"
                opacity={0.7}
              />
              
              <!-- 为着法添加数字标记（在圆圈里，不偏移） -->
              <g transform={`translate(${toX}, ${toY})`}>
                <text
                  x="0"
                  y="0"
                  fill={color}
                  font-size={cellSize * 0.5}
                  text-anchor="middle"
                  dominant-baseline="central"
                  opacity="0.9"
                  font-weight="bold"
                  style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                >
                  {index + 1}
                </text>
              </g>
            {/if}
          {/if}
        {/each}
      </g>
    {/if}
    
    <!-- 云库着法 -->
    {#if showCloudMoves && cloudMoves && cloudMoves.length > 0}
      <!-- 检测是否有重叠的着法（终点相同或起点相同） -->
      {@const displayMoves = cloudMoves.slice(0, 4)}
      <!-- 按位置分组着法 -->
      {@const movesByPosition = displayMoves.filter(m => m.from && m.to).reduce((acc, move) => {
        const to = rotated ? rotatePos(move.to) : move.to;
        const positionKey = `${to.x},${to.y}`;
        if (!acc[positionKey]) {
          acc[positionKey] = [];
        }
        acc[positionKey].push(move);
        return acc;
      }, {} as Record<string, typeof displayMoves>)}
      <!-- 按起点分组着法 -->
      {@const movesByStartPosition = displayMoves.filter(m => m.from && m.to).reduce((acc, move) => {
        const from = rotated ? rotatePos(move.from) : move.from;
        const startKey = `${from.x},${from.y}`;
        if (!acc[startKey]) {
          acc[startKey] = [];
        }
        acc[startKey].push(move);
        return acc;
      }, {} as Record<string, typeof displayMoves>)}
      <!-- 检测路线交叉 -->
      {@const movesWithIntersections = displayMoves.filter((move, index) => {
        if (!move.from || !move.to) return false;
        const from = rotated ? rotatePos(move.from) : move.from;
        const to = rotated ? rotatePos(move.to) : move.to;
        const p1 = {x: (from.x + 1) * cellSize, y: (from.y + 1) * cellSize};
        const p2 = {x: (to.x + 1) * cellSize, y: (to.y + 1) * cellSize};
        
        // 检查与之前的着法是否交叉，或路径经过其他着法的终点
        for (let i = 0; i < index; i++) {
          const otherMove = displayMoves[i];
          if (!otherMove.from || !otherMove.to) continue;
          const otherFrom = rotated ? rotatePos(otherMove.from) : otherMove.from;
          const otherTo = rotated ? rotatePos(otherMove.to) : otherMove.to;
          const p3 = {x: (otherFrom.x + 1) * cellSize, y: (otherFrom.y + 1) * cellSize};
          const p4 = {x: (otherTo.x + 1) * cellSize, y: (otherTo.y + 1) * cellSize};
          
          // 检查线路交叉
          if (doLineSegmentsIntersect(p1, p2, p3, p4)) {
            return true;
          }
          
          // 检查当前着法的路径是否经过其他着法的终点
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const otherToPoint = p4;
          
          // 计算其他着法终点到当前着法线路的距离
          const t = ((otherToPoint.x - p1.x) * dx + (otherToPoint.y - p1.y) * dy) / (distance * distance);
          const tClamped = Math.max(0, Math.min(1, t));
          const closestX = p1.x + tClamped * dx;
          const closestY = p1.y + tClamped * dy;
          const distToLine = Math.sqrt((otherToPoint.x - closestX) ** 2 + (otherToPoint.y - closestY) ** 2);
          
          // 如果距离小于一个棋子的大小，认为路径经过该终点
          if (distToLine < cellSize * 0.5) {
            return true;
          }
        }
        return false;
      })}
      <!-- 检查云库着法是否与用户分支重合 -->
      {@const isCloudMoveOverlapsWithVariation = (cloudMove: ICloudMove): boolean => {
        // 只有当用户分支数量大于1时，才隐藏云库分支的线条和圆圈
        // 这样当用户只有一步棋时，云库分支不会孤零零的只有胜率
        if (!cloudMove.from || !cloudMove.to || !variations || variations.length <= 1) return false;
        
        const cloudFrom = rotated ? rotatePos(cloudMove.from) : cloudMove.from;
        const cloudTo = rotated ? rotatePos(cloudMove.to) : cloudMove.to;
        
        return variations.some(variation => {
          if (!variation.from || !variation.to) return false;
          const varFrom = rotated ? rotatePos(variation.from) : variation.from;
          const varTo = rotated ? rotatePos(variation.to) : variation.to;
          return cloudFrom.x === varFrom.x && cloudFrom.y === varFrom.y && cloudTo.x === varTo.x && cloudTo.y === varTo.y;
        });
      }}
      
      <g id="cloud-variations">
        {#each displayMoves.filter((move, idx, arr) => {
          // 过滤掉终点相同且胜率相同的着法，只保留第一个
          const sameEndMoves = arr.filter(m => {
            if (!m.from || !m.to || !move.from || !move.to) return false;
            const mTo = rotated ? rotatePos(m.to) : m.to;
            const moveTo = rotated ? rotatePos(move.to) : move.to;
            return mTo.x === moveTo.x && mTo.y === moveTo.y && Math.round(m.winrate) === Math.round(move.winrate);
          });
          return sameEndMoves.indexOf(move) === 0;
        }) as cloudMove, index}
          <!-- 计算着法的起点和终点 -->
          {#if cloudMove.from && cloudMove.to}
            {@const from = rotated ? rotatePos(cloudMove.from) : cloudMove.from}
            {@const to = rotated ? rotatePos(cloudMove.to) : cloudMove.to}
            <!-- 计算起点和终点的坐标 -->
            {@const fromX = (from.x + 1) * cellSize}
            {@const fromY = (from.y + 1) * cellSize}
            {@const toX = (to.x + 1) * cellSize}
            {@const toY = (to.y + 1) * cellSize}
            
            <!-- 检查是否与用户分支重合 -->
            {@const overlapsWithVariation = isCloudMoveOverlapsWithVariation(cloudMove)}
            
            <!-- 检查是否有重叠的着法 -->
            {@const positionKey = `${to.x},${to.y}`}
            {@const positionMoves = movesByPosition[positionKey] || []}
            {@const hasEndOverlap = positionMoves.length > 1}
            
            <!-- 检查是否有相同起点的着法（线重叠） -->
            {@const startKey = `${from.x},${from.y}`}
            {@const startMoves = movesByStartPosition[startKey] || []}
            {@const hasStartOverlap = startMoves.length > 1}
            <!-- 计算当前着法在起点分组中的索引 -->
            {@const startIndex = startMoves.indexOf(cloudMove)}
            
            <!-- 检查是否有路线交叉 -->
            {@const hasIntersection = movesWithIntersections.includes(cloudMove)}
            
            <!-- 综合判断是否有重叠或交叉 -->
            {@const hasOverlap = hasEndOverlap || hasStartOverlap || hasIntersection}
            
            <!-- 找到胜率最高的着法 -->
            {@const bestMove = positionMoves.reduce((best, move) => move.winrate > best.winrate ? move : best, positionMoves[0])}
            <!-- 判断当前着法是否是胜率最高的 -->
            {@const isBestMove = cloudMove === bestMove}
            
            <!-- 为每个着法添加颜色偏移，确保不同的着法有不同的颜色 -->
            {@const baseColor = settings.cloudMoveColor || "#187C00"}
            <!-- 基于索引为每个着法生成不同的颜色 -->
            {@const adjustedColor = adjustColor(baseColor, index)}
            
            <!-- 计算线条终点（到达圆圈边缘） -->
            {@const dx = toX - fromX}
            {@const dy = toY - fromY}
            {@const distance = Math.sqrt(dx * dx + dy * dy)}
            {@const radius = cellSize * 0.3}
            {@const lineEndX = toX - (dx / distance) * radius}
            {@const lineEndY = toY - (dy / distance) * radius}
            
            <!-- 计算标签位置 -->
            {@const labelOffset = cellSize * 0.3}
            {@const labelX = toX + (dx / distance) * labelOffset}
            {@const labelY = toY + (dy / distance) * labelOffset}
            
            <!-- 计算标签文本的对齐方式 -->
            {@const textAnchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'}
            {@const dominantBaseline = dy > 0 ? 'hanging' : dy < 0 ? 'baseline' : 'central'}
            
            {#if overlapsWithVariation}
              <!-- 与用户分支重合，只显示胜率，不显示线条和圆圈 -->
              <!-- 为着法添加胜率标记（在圆圈里，不偏移） -->
              <g transform={`translate(${toX}, ${toY})`}>
                <text
                  x="0"
                  y="0"
                  fill={adjustedColor}
                  font-size={cellSize * 0.32}
                  text-anchor="middle"
                  dominant-baseline="central"
                  opacity="0.95"
                  font-weight="bold"
                  style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                >
                  {Math.round(cloudMove.winrate)}
                </text>
              </g>
            {:else if (hasEndOverlap && !isBestMove) || hasIntersection || (hasStartOverlap && !isBestMove)}
              <!-- 有终点重叠且不是胜率最高的，或路线交叉的着法，或起点相同且不是胜率最高的着法，使用弧线绘制，并沿着来源方向偏移标签 -->
              <!-- 计算弧线参数 -->
              {@const angle = Math.atan2(dy, dx)}
              <!-- 为起点相同的着法生成不同的弧线半径和方向 -->
              {@const arcRadius = hasStartOverlap ? Math.max(cellSize * 2, distance / 2) + (startIndex * cellSize) : Math.max(cellSize * 2, distance / 2)}
              {@const sweepFlag = hasStartOverlap && startIndex % 2 === 1 ? 0 : 1} <!-- 交替弧线方向 -->
              {@const arcCenterX = toX - Math.cos(angle) * arcRadius}
              {@const arcCenterY = toY - Math.sin(angle) * arcRadius}
              {@const startAngle = angle + Math.PI}
              {@const endAngle = angle}
              {@const largeArcFlag = 0}
              
              <!-- 绘制弧线 -->
              <path
                d={`M ${fromX} ${fromY} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${lineEndX} ${lineEndY}`}
                stroke={adjustedColor}
                stroke-width={cellSize * 0.06}
                stroke-dasharray={`${cellSize * 0.15} ${cellSize * 0.1}`}
                opacity={0.6}
                fill="none"
                stroke-linecap="round"
              />
              
              <!-- 绘制着法终点标记 -->
              <circle
                cx={toX}
                cy={toY}
                r={cellSize * 0.3}
                stroke={adjustedColor}
                stroke-width={cellSize * 0.06}
                fill="none"
                opacity={0.6}
              />
              
              {#if hasEndOverlap && !isBestMove}
                <!-- 只有终点有重叠且不是胜率最高的着法，才偏移标签 -->
                <!-- 朝向起点方向偏移标签 -->
                {@const overlapOffset = cellSize * 0.3}
                {@const overlapLabelX = toX - (dx / distance) * overlapOffset}
                {@const overlapLabelY = toY - (dy / distance) * overlapOffset}
                
                <!-- 为着法添加胜率标记（沿着来源方向偏移） -->
                <g transform={`translate(${overlapLabelX}, ${overlapLabelY})`}>
                  <text
                    x="0"
                    y="0"
                    fill={adjustedColor}
                    font-size={cellSize * 0.32}
                    text-anchor="end"
                    dominant-baseline="central"
                    opacity="0.95"
                    font-weight="bold"
                    style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                  >
                    {Math.round(cloudMove.winrate)}
                  </text>
                </g>
              {:else}
                <!-- 终点没有重叠，标签不偏移，放在圆圈里 -->
                <!-- 为着法添加胜率标记（在圆圈里，不偏移） -->
                <g transform={`translate(${toX}, ${toY})`}>
                  <text
                    x="0"
                    y="0"
                    fill={adjustedColor}
                    font-size={cellSize * 0.32}
                    text-anchor="middle"
                    dominant-baseline="central"
                    opacity="0.95"
                    font-weight="bold"
                    style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                  >
                    {Math.round(cloudMove.winrate)}
                  </text>
                </g>
              {/if}
            {:else}
              <!-- 没有重叠或胜率最高的着法，使用直线绘制，标签放在圆圈里 -->
              <!-- 绘制着法线路 -->
              <line
                x1={fromX}
                y1={fromY}
                x2={lineEndX}
                y2={lineEndY}
                stroke={adjustedColor}
                stroke-width={cellSize * 0.06}
                stroke-dasharray={`${cellSize * 0.15} ${cellSize * 0.1}`}
                opacity={0.6}
                stroke-linecap="round"
              />
              <!-- 绘制着法终点标记 -->
              <circle
                cx={toX}
                cy={toY}
                r={cellSize * 0.3}
                stroke={adjustedColor}
                stroke-width={cellSize * 0.06}
                fill="none"
                opacity={0.6}
              />
              
              <!-- 为着法添加胜率标记（在圆圈里，不偏移） -->
              <g transform={`translate(${toX}, ${toY})`}>
                <text
                  x="0"
                  y="0"
                  fill={adjustedColor}
                  font-size={cellSize * 0.32}
                  text-anchor="middle"
                  dominant-baseline="central"
                  opacity="0.95"
                  font-weight="bold"
                  style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
                >
                  {Math.round(cloudMove.winrate)}
                </text>
              </g>
            {/if}
          {/if}
        {/each}
      </g>
    {/if}

    <!-- 单个位置标记 -->
    {#if renderedMarkedPos}
      <g
        class="marked-position"
        transform={`translate(${(renderedMarkedPos.x + 1) * cellSize}, ${(renderedMarkedPos.y + 1) * cellSize})`}
      >
        <path
          d={`M ${-0.4 * cellSize},${-0.4 * cellSize + margin} v ${-margin} h ${margin}
              M ${0.4 * cellSize - margin},${-0.4 * cellSize} h ${margin} v ${margin}
              M ${0.4 * cellSize},${0.4 * cellSize - margin} v ${margin} h ${-margin}
              M ${-0.4 * cellSize + margin},${0.4 * cellSize} h ${-margin} v ${-margin}`}
          stroke="var(--board-line)"
          stroke-width={cellSize * 0.04}
          fill="none"
        />
      </g>
    {/if}

    <!-- 上次走子标记 -->
    {#if showLastMove && renderedLastMove && !renderedMarkedPos}
      <g class="last-move-marker">
        <!-- 起始位置标记 -->
        <g
          transform={`translate(${(renderedLastMove.from.x + 1) * cellSize}, ${(renderedLastMove.from.y + 1) * cellSize})`}
        >
          <rect
            x={-cellSize * 0.2}
            y={-cellSize * 0.2}
            width={cellSize * 0.4}
            height={cellSize * 0.4}
            fill={currentTurn === "red" ? "var(--piece-black)" : "var(--piece-red)"}
            stroke="var(--board-line)"
            stroke-width={cellSize * 0.02}
            opacity="0.7"
          />
        </g>
        <!-- 结束位置标记 -->
        <g
          transform={`translate(${(renderedLastMove.to.x + 1) * cellSize}, ${(renderedLastMove.to.y + 1) * cellSize})`}
        >
          <path
            d={`M ${-0.4 * cellSize},${-0.4 * cellSize + margin} v ${-margin} h ${margin}
              M ${0.4 * cellSize - margin},${-0.4 * cellSize} h ${margin} v ${margin}
              M ${0.4 * cellSize},${0.4 * cellSize - margin} v ${margin} h ${-margin}
              M ${-0.4 * cellSize + margin},${0.4 * cellSize} h ${-margin} v ${-margin}`}
            stroke="var(--board-line)"
            stroke-width={cellSize * 0.04}
            fill="none"
          />
        </g>
      </g>
    {/if}
  </svg>
</div>

<style>
  .board-container {
    --board-background: var(--xq-board-background, var(--background-primary-alt));
    --board-line: var(--xq-board-line, var(--text-normal));
    --piece-red: var(--xq-piece-red, var(--color-red));
    --piece-black: var(--xq-piece-black, var(--color-blue));
    --text-color: var(--xq-text-color, var(--text-normal));
    margin-top: calc(var(--board-margin-top, 0px) * 1px);
    margin-bottom: calc(var(--board-margin-bottom, 0px) * 1px);
  }
  .xq-board {
    user-select: none;
    width: 100%;
    height: 100%;
  }
</style>
