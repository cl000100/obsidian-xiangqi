import { Notice, requestUrl } from "obsidian";
import { registerPGNViewModule } from "../../core/module-system";
import type { ChessNode, IMove, ICloudMove } from "../../types";
import { getICCS, genFENFromBoard, genChinesePGNFromMoves, genUBBFromMoves } from "../../utils/parse";

const ActionsModule = {
    init(host: Record<string, any>) {
        const eventBus = host.eventBus;
        
        // 防抖函数，避免频繁识别
        let identificationTimeout: number | undefined;
        
        // 防抖函数，避免频繁请求云库
        let cloudLibraryTimeout: number | undefined;
        
        // 缓存识别结果，避免重复识别相同的棋局
        let lastPGN: string = '';
        let lastOpeningResult: { opening: string; variation: string } | null = null;
        
        // 自动识别开局函数
        function autoIdentifyOpening() {
            // 检查是否启用了自动识别
            if (!host.settings?.enableAutoOpeningIdentification) return;
            
            // 生成当前路径的PGN，用于缓存判断
            let currentPGN = "";
            let currentPathLength = 0;
            if (host.currentNode && host.currentNode.id !== 'node-root') {
                // 构建从根节点到当前选中节点的路径
                let currentNode = host.currentNode;
                const pathNodes = [];
                
                // 从当前节点向上回溯到根节点
                while (currentNode) {
                    pathNodes.unshift(currentNode);
                    if (currentNode.parentID) {
                        currentNode = host.nodeMap.get(currentNode.parentID);
                    } else {
                        break;
                    }
                }
                
                // 计算当前路径的实际步数
                currentPathLength = pathNodes.length - 1; // 减去根节点
                
                // 检查是否达到最小识别步数
                const minMoves = host.settings?.minMovesForIdentification || 4;
                if (currentPathLength < minMoves) return;
                
                // 生成PGN
                let result = '';
                let currentStepNum = 1;
                
                for (let i = 1; i < pathNodes.length; i++) {
                    const node = pathNodes[i];
                    if (node && node.data) {
                        if (node.side === 'red') {
                            result += `${currentStepNum}. ${node.data.ICCS}`;
                        } else if (node.side === 'black') {
                            result += `${node.data.ICCS}`;
                        }
                        
                        if (i < pathNodes.length - 1) {
                            result += ` `;
                        }
                        
                        // 更新步数
                        if (node.side === 'red') {
                            currentStepNum++;
                        }
                    }
                }
                
                currentPGN = result;
            }
            
            // 检查PGN是否有效且与上次不同
            if (!currentPGN || currentPGN === lastPGN) return;
            
            // 触发btn-click事件，传递identifyOpening命令和auto参数
            eventBus.emit('btn-click', { name: 'identifyOpening', payload: { auto: true, pgn: currentPGN } });
        }

        // 解析云库着法信息
        function parseCloudMoves(response: string): ICloudMove[] {
            if (response === 'unknown' || response === 'invalid board' || response === 'checkmate' || response === 'stalemate') {
                return [];
            }
            
            const moves = response.split('|');
            
            const result = moves.map(moveStr => {
                const parts = moveStr.split(',');
                if (parts.length < 4) {
                    return null;
                }
                
                // 解析字段值
                let move = '';
                let score = 0;
                let rank = 0;
                let winrate = 0;
                let note = '';
                let hasWinrate = false;
                
                for (const part of parts) {
                    const [key, value] = part.split(':');
                    if (!key || !value) continue;
                    
                    if (key === 'move') move = value;
                    else if (key === 'score') {
                        score = parseInt(value) || 0;
                    }
                    else if (key === 'rank') rank = parseInt(value) || 0;
                    else if (key === 'winrate') {
                        const parsedWinrate = parseFloat(value);
                        winrate = isNaN(parsedWinrate) ? 0 : parsedWinrate;
                        hasWinrate = true;
                    }
                    else if (key === 'note') note = value;
                }
                
                // 如果没有winrate字段，根据score计算一个估计值
                if (!hasWinrate) {
                    // 改进的胜率计算逻辑
                    // 将score值限制在-1000到1000之间
                    const normalizedScore = Math.max(-1000, Math.min(1000, score));
                    // 使用线性转换将score转换为0-100的winrate
                    winrate = 50 + (normalizedScore / 20);
                    // 确保winrate在0-100之间
                    winrate = Math.max(0, Math.min(100, winrate));
                }
                
                // 解析着法为坐标 (格式: c3c4)
                let from: { x: number; y: number } | undefined;
                let to: { x: number; y: number } | undefined;
                
                if (move.length === 4) {
                    const fromX = move.charCodeAt(0) - 97; // a-i -> 0-8
                    const fromY = 9 - parseInt(move[1]); // 0-9 -> 9-0
                    const toX = move.charCodeAt(2) - 97; // a-i -> 0-8
                    const toY = 9 - parseInt(move[3]); // 0-9 -> 9-0
                    
                    from = { x: fromX, y: fromY };
                    to = { x: toX, y: toY };
                }
                
                return {
                    move,
                    score,
                    rank,
                    winrate,
                    note,
                    from,
                    to
                };
            }).filter((move): move is NonNullable<typeof move> => move !== null);
            
            return result;
        }
        
        // 获取云库着法信息
        async function fetchCloudMoves() {
            if (!host.currentNode || !host.currentNode.board) {
                return;
            }
            
            // 检查是否启用云库
            if (!host.settings?.enableCloudLibrary) {
                return;
            }
            
            try {
                const fen = genFENFromBoard(host.currentNode.board, host.currentTurn);
                const url = `http://www.chessdb.cn/chessdb.php?action=queryall&board=${encodeURIComponent(fen)}`;
                
                const response = await requestUrl(url);
                const cloudMoves = parseCloudMoves(response.text);
                
                // 无论是否有云库着法，都更新currentNode.cloudMoves
                // 这样当残局库中没有对应棋局时，会清除之前的着法信息
                host.currentNode = {
                    ...host.currentNode,
                    cloudMoves
                };
                eventBus.emit('updateUI');
            } catch (error) {
                console.error('获取云库着法失败:', error);
            }
        }

        eventBus.on('runmove', (move: IMove) => {
            const { from, to } = move
            const currentNode = host.currentNode;
            for (let node of currentNode.children) {
                if (node.data && node.data.from.x === from.x && node.data.from.y === from.y && node.data.to.x === to.x && node.data.to.y === to.y) {
                    host.currentNode = node;
                    host.board = host.currentNode.board;
                    host.currentTurn = host.currentTurn === 'red' ? 'black' : 'red';
                    host.updateMainPath();
                    eventBus.emit('updateUI');
                    // 获取云库着法
                    fetchCloudMoves();
                    return;
                }
            }
            const piece = host.currentNode.board![move.from.x][move.from.y];
            move.type = piece;
            move.ICCS = getICCS(move);
            
            // 确保 nodeId 是 nodeMap 中最大的 ID + 1，避免 ID 冲突
            if (!host.nodeId || host.nodeId <= parseInt(host.currentNode.id.replace('node-', ''))) {
                host.nodeId = parseInt(host.currentNode.id.replace('node-', '')) + 1;
            }
            
            const newNode: ChessNode = {
                id: `node-${host.nodeId++}`,
                data: move,
                step: host.currentStep,
                side: host.currentTurn,
                parentID: host.currentNode.id,
                children: [],
                mainID: null,
                comments: []
            };
            host.nodeMap.set(newNode.id, newNode);
            const newboard = host.currentNode.board!.map((row: string | null[]) => row.slice());
            newboard[move.from.x][move.from.y] = null; // 清除原位置
            if (newboard[move.to.x][move.to.y]) {
                move.captured = newboard[move.to.x][move.to.y]; // 记录被吃掉的棋子
            }
            newboard[move.to.x][move.to.y] = piece; // 设置新位置
            newNode.board = newboard;
            host.board = newboard;
            host.currentNode.children.push(newNode);
            host.currentNode = newNode;
            host.currentTurn = host.currentTurn === 'red' ? 'black' : 'red';
            host.currentStep++;
            host.updateMainPath();
            eventBus.emit('updateUI');
            eventBus.emit('updatePGN');
            
            // 自动识别开局
            const delay = host.settings?.autoIdentificationDelay || 500;
            if (identificationTimeout) {
                clearTimeout(identificationTimeout);
            }
            identificationTimeout = window.setTimeout(autoIdentifyOpening, delay);
            
            // 获取云库着法（防抖处理）
            const cloudDelay = host.settings?.cloudLibraryDelay || 300;
            if (cloudLibraryTimeout) {
                clearTimeout(cloudLibraryTimeout);
            }
            cloudLibraryTimeout = window.setTimeout(fetchCloudMoves, cloudDelay);
        })
        eventBus.on('node-click', (id: string) => {
            host.markedPos = null;
            host.currentNode = host.nodeMap.get(id);
            host.board = host.currentNode.board;
            host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
            host.updateMainPath();
            host.eventBus.emit('updateUI');
            // 自动识别开局（防抖处理）
            const delay = host.settings?.autoIdentificationDelay || 500;
            if (identificationTimeout) {
                clearTimeout(identificationTimeout);
            }
            identificationTimeout = window.setTimeout(autoIdentifyOpening, delay);
            // 获取云库着法（防抖处理）
            const cloudDelay = host.settings?.cloudLibraryDelay || 300;
            if (cloudLibraryTimeout) {
                clearTimeout(cloudLibraryTimeout);
            }
            cloudLibraryTimeout = window.setTimeout(fetchCloudMoves, cloudDelay);
        })

        eventBus.on('updatePGN', () => {
            const pgn = stringifyPGN(host.root);
            const content = [host.tags?.trim(), pgn]
                .filter(Boolean)
                .join('\n');
            host.data = content;
            host.saveFile();
        })

        eventBus.on('btn-click', (payload: { name: string, payload: any }) => {
            host.markedPos = null;
            const { name, payload: data } = payload;
            switch (name) {
                case 'annotation': {
                    if (!host.currentNode) break;
                    const node = host.currentNode;
                    if (!node.comments) {
                        node.comments = [];
                    }

                    // 定义所有可能的批注符号
                    const ALL_ANNOTATIONS = ["R+", "B+", "=", "?", "!", "?!", "R#", "B#"];
                    const isClickedDataAnnotation = ALL_ANNOTATIONS.includes(data);

                    if (isClickedDataAnnotation) {
                        const existingAnnotationIndex = node.comments.indexOf(data);

                        if (existingAnnotationIndex !== -1) {
                            // 如果点击的批注已存在，则移除它（取消批注）
                            node.comments.splice(existingAnnotationIndex, 1);
                        } else {
                            // 如果点击的批注不存在，则清除所有其他批注，然后添加新的批注
                            node.comments = node.comments.filter((comment: string) => !ALL_ANNOTATIONS.includes(comment)); // 清除所有现有批注
                            node.comments.push(data); // 添加新的批注
                        }
                    }
                    break;
                }
                case 'remove': {
                    if (host.currentNode.id === 'node-root') {
                        host.currentNode.children = [];
                        host.nodeMap.clear();
                        host.nodeMap.set(host.currentNode.id, host.currentNode)
                        host.nodeId = 1; // 重置 nodeId
                        eventBus.emit("node-click", host.currentNode.id);
                        break;

                    }
                    const removeNode = host.currentNode;
                    const parentNode = host.nodeMap.get(removeNode.parentID!);

                    host.currentNode = parentNode;

                    if (parentNode) {
                        const index = parentNode.children.indexOf(removeNode);
                        if (index !== -1) parentNode.children.splice(index, 1);
                    }

                    function deleteSubtree(node: ChessNode) {
                        for (const child of node.children) {
                            deleteSubtree(child);
                        }
                        host.nodeMap.delete(node.id);
                    }

                    deleteSubtree(removeNode);
                    
                    // 重新计算 nodeId 为当前 nodeMap 中最大 ID + 1
                    let maxId = 0;
                    for (const nodeId of host.nodeMap.keys()) {
                        if (nodeId !== 'node-root') {
                            const numId = parseInt(nodeId.replace('node-', ''));
                            if (numId > maxId) {
                                maxId = numId;
                            }
                        }
                    }
                    host.nodeId = maxId + 1;
                    
                    host.updateMainPath();
                    eventBus.emit("node-click", host.currentNode.id);
                    break;
                }
                case 'promote': {
                    if (!host.currentNode.parentID || host.currentNode.id === 'node-root') break;

                    let nodeToPromote = host.currentNode;
                    let parent = host.nodeMap.get(nodeToPromote.parentID!);

                    if (!parent) break;

                    // Find the ancestor that is not the first child
                    while (parent.children.length > 0 && parent.children[0].id === nodeToPromote.id) {
                        if (!parent.parentID) break; // Reached the root's direct child, and it's the main line
                        nodeToPromote = parent;
                        parent = host.nodeMap.get(parent.parentID);
                        if (!parent) break;
                    }

                    // Now, `parent` is the node whose children need reordering.
                    // `nodeToPromote` is the child to be promoted.

                    // Clear mainID on all siblings before reordering
                    for (const child of parent.children) {
                        child.mainID = null;
                    }

                    const children = parent.children;
                    const index = children.findIndex((c: ChessNode) => c.id === nodeToPromote.id);

                    if (index > 0) { // If it's not already the main line
                        const item = children[index];
                        // Create new array for reactivity, reordering the item to the front
                        const otherChildren = children.filter((c: ChessNode) => c.id !== item.id);
                        parent.children = [item, ...otherChildren];
                    }

                    host.updateMainPath();
                    break;
                }
                case 'toStart': {
                    host.currentNode = host.nodeMap.get(host.currentPath[0]);
                    host.board = host.currentNode.board;
                    host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                    break;
                }
                case 'back': {
                    if (host.currentNode.parentID) {
                        host.currentNode = host.nodeMap.get(host.currentNode.parentID);
                        host.board = host.currentNode.board;
                        host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                    }
                    break;
                }
                case 'next': {
                    const currentIndex = host.currentPath.indexOf(host.currentNode.id);
                    if (currentIndex < host.currentPath.length - 1) {
                        const nextNodeId = host.currentPath[currentIndex + 1];
                        host.currentNode = host.nodeMap.get(nextNodeId);
                        host.board = host.currentNode.board;
                        host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                    }
                    break;
                }
                case 'toEnd': {
                    host.currentNode = host.nodeMap.get(host.currentPath[host.currentPath.length - 1]);
                    host.board = host.currentNode.board;
                    host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                    break;
                }
                case 'prevVariation': {
                    // 找到当前分支的分叉点（有多个子节点的父节点）
                    let current = host.currentNode;
                    let foundFork = false;
                    
                    while (current.parentID) {
                        const parentNode = host.nodeMap.get(current.parentID);
                        if (parentNode && parentNode.children.length > 1) {
                            // 找到分叉点，切换到该节点
                            host.currentNode = parentNode;
                            host.board = host.currentNode.board;
                            host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                            host.updateMainPath();
                            eventBus.emit('updateUI');
                            foundFork = true;
                            break;
                        }
                        current = parentNode;
                    }
                    
                    // 如果没有找到分叉点，回到开局（根节点）
                    if (!foundFork && host.currentNode.parentID) {
                        host.currentNode = host.root;
                        host.board = host.currentNode.board;
                        host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                        host.updateMainPath();
                        eventBus.emit('updateUI');
                    }
                    break;
                }
                case 'nextVariation': {
                    // 向下查找分叉点（当前路径上第一个有多个子节点的节点）
                    let current = host.currentNode;
                    let foundFork = false;
                    let lastNode = current;
                    
                    while (current) {
                        // 记录最后一个节点，用于跳到终局
                        lastNode = current;
                        
                        // 如果当前节点是分叉点，且不是起始节点，则切换到该节点
                        if (current.children.length > 1 && current !== host.currentNode) {
                            // 找到分叉点，切换到该节点
                            host.currentNode = current;
                            host.board = host.currentNode.board;
                            host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                            host.updateMainPath();
                            eventBus.emit('updateUI');
                            foundFork = true;
                            break;
                        }
                        
                        // 沿着主路径向下遍历
                        if (current.children.length > 0) {
                            current = current.children[0];
                        } else {
                            break;
                        }
                    }
                    
                    // 如果没有找到分叉点，跳到终局（主路径的最后一个节点）
                    if (!foundFork && lastNode !== host.currentNode) {
                        host.currentNode = lastNode;
                        host.board = host.currentNode.board;
                        host.currentTurn = host.currentNode.side === 'red' ? 'black' : 'red';
                        host.updateMainPath();
                        eventBus.emit('updateUI');
                    }
                    break;
                }
                case 'openPikafish': {
                    // 1. 从 root 节点获取 fen 和 firstturn
                    const initialFen = genFENFromBoard(host.root.board!, host.root.side === 'red' ? 'black' : 'red');

                    // 2. 根据 currentPath 获取行棋的着法
                    // host.mainPath 包含 root 节点，但 root 节点没有 move data，所以从第二个节点开始
                    const movesOnCurrentPath: string[] = [];
                    for (let i = 1; i < host.currentPath.length; i++) {
                        const nodeId = host.currentPath[i];
                        const node = host.nodeMap.get(nodeId);
                        if (node && node.data && node.data.ICCS) {
                            movesOnCurrentPath.push(node.data.ICCS.replace('-', '').toLowerCase());
                        }
                    }
                    const movesStr = movesOnCurrentPath.join('');

                    // 3. 完善 URL
                    const url = `https://xiangqiai.com/#/${initialFen} moves ${movesStr}`;
                    window.open(url);
                    break;
                }
                case 'copyPGN': {
                    // 1. 获取初始棋盘状态
                    const board = host.root.board!;
                    const firstTurn = host.root.side === 'red' ? 'black' : 'red';
                    
                    // 2. 生成FEN值
                    const fen = genFENFromBoard(board, firstTurn);
                    
                    // 3. 生成包含分支的 PGN 格式
                    const pgnMoves = stringifyPGN(host.root);
                    
                    // 4. 获取文件名（安全方式）
                    let fileName = "残局";
                    if ((host as any).file) {
                        fileName = (host as any).file.name.replace(/\.(md|pgn)$/, "");
                    }
                    
                    // 5. 构建完整的 PGN 格式
                    let pgnContent = "[Game \"Chinese Chess\"]\n";
                    pgnContent += "[Event \"\"]\n";
                    pgnContent += `[Title \"${fileName}\"]\n`;
                    pgnContent += `[Date \"${new Date().toISOString().split('T')[0]}\"]\n`;
                    pgnContent += "[Round \"\"]\n";
                    pgnContent += "[RedName \"\"]\n";
                    pgnContent += "[BlackName \"\"]\n";
                    pgnContent += "[Result \"未知\"]\n";
                    pgnContent += `[FEN \"${fen}\"]\n`;
                    pgnContent += "[Table \"0\"]\n\n";
                    pgnContent += pgnMoves;
                    pgnContent += "\n";

                    // 3. 复制到剪贴板
                    navigator.clipboard.writeText(pgnContent).then(() => {
                        new Notice('PGN格式已复制到剪贴板');
                    }).catch(err => {
                        console.error('复制失败:', err);
                        new Notice('复制失败，请手动复制');
                    });
                    break;
                }
                case 'copyChinesePGN': {
                    // 1. 从 root 节点获取初始棋盘和走棋方
                    const board = host.root.board!;
                    const firstTurn = host.root.side === 'red' ? 'black' : 'red';

                    // 2. 根据 currentPath 获取行棋的着法，包含注释
                    const moves: IMove[] = [];
                    for (let i = 1; i < host.currentPath.length; i++) {
                        const nodeId = host.currentPath[i];
                        const node = host.nodeMap.get(nodeId);
                        if (node && node.data) {
                            // 复制节点数据，包含注释
                            const moveWithComments = {
                                ...node.data,
                                comments: node.comments
                            };
                            moves.push(moveWithComments);
                        }
                    }

                    // 3. 获取文件名（安全方式）
                    let fileName = "";
                    if ((host as any).file) {
                        fileName = (host as any).file.name.replace(/\.(md|pgn)$/, "");
                    }
                    
                    // 4. 生成中文 PGN 格式
                    const chinesePgnContent = genChinesePGNFromMoves(board, firstTurn, moves, fileName);

                    // 4. 复制到剪贴板
                    navigator.clipboard.writeText(chinesePgnContent).then(() => {
                        new Notice('中文PGN格式已复制到剪贴板');
                    }).catch(err => {
                        console.error('复制失败:', err);
                        new Notice('复制失败，请手动复制');
                    });
                    break;
                }
                case 'copyUBB': {
                    // 1. 从 root 节点获取初始棋盘和走棋方
                    const board = host.root.board!;
                    const firstTurn = host.root.side === 'red' ? 'black' : 'red';

                    // 2. 从 source 中提取 PGN 元数据
                    const headerRegex = /\[(\w+)\s+"([^"]+)"\]/g;
                    const tags: Record<string, string> = {};
                    let match;
                    while ((match = headerRegex.exec(host.source)) !== null) {
                        const key = match[1];
                        const value = match[2];
                        tags[key] = value;
                    }

                    // 3. 获取文件名（安全方式）
                    let fileName = "";
                    if ((host as any).file) {
                        fileName = (host as any).file.name.replace(/\.(md|pgn)$/, "");
                    }
                    
                    // 4. 生成 UBB 格式
                    const ubbContent = genUBBFromMoves(board, firstTurn, [], host.nodeMap, host.currentPath, tags, fileName);

                    // 4. 复制到剪贴板
                    navigator.clipboard.writeText(ubbContent).then(() => {
                        new Notice('UBB格式已复制到剪贴板');
                    }).catch(err => {
                        console.error('复制失败:', err);
                        new Notice('复制失败，请手动复制');
                    });
                    break;
                }
                case 'copyEnglishPGN': {
                    // 1. 获取初始棋盘状态
                    const board = host.root.board!;
                    const firstTurn = host.root.side === 'red' ? 'black' : 'red';
                    
                    // 2. 生成FEN值
                    const fen = genFENFromBoard(board, firstTurn);
                    
                    // 3. 生成不包含分支的 PGN 格式（从根节点到当前选中节点）
                    let pgnMoves = "";
                    if (host.currentNode && host.currentNode.id !== 'node-root') {
                        // 构建从根节点到当前选中节点的路径
                        let currentNode = host.currentNode;
                        const pathNodes = [];
                        
                        // 从当前节点向上回溯到根节点
                        while (currentNode) {
                            pathNodes.unshift(currentNode);
                            if (currentNode.parentID) {
                                currentNode = host.nodeMap.get(currentNode.parentID);
                            } else {
                                break;
                            }
                        }
                        
                        // 生成PGN
                        let result = '';
                        let currentStepNum = 1;
                        
                        for (let i = 1; i < pathNodes.length; i++) {
                            const node = pathNodes[i];
                            if (node && node.data) {
                                if (node.side === 'red') {
                                    result += `${currentStepNum}. ${node.data.ICCS}`;
                                } else if (node.side === 'black') {
                                    result += `${node.data.ICCS}`;
                                }
                                
                                // 添加节点注释
                                if (node.comments?.length) {
                                    for (const comment of node.comments) {
                                        result += ` {${comment}}`;
                                    }
                                }
                                
                                if (i < pathNodes.length - 1) {
                                    result += `\n`;
                                }
                                
                                // 更新步数
                                if (node.side === 'red') {
                                    currentStepNum++;
                                }
                            }
                        }
                        
                        pgnMoves = result;
                    }
                    
                    // 4. 获取文件名（安全方式）
                    let fileName = "残局";
                    if ((host as any).file) {
                        fileName = (host as any).file.name.replace(/\.(md|pgn)$/, "");
                    }
                    
                    // 5. 构建完整的 PGN 格式
                    let pgnContent = "[Game \"Chinese Chess\"]\n";
                    pgnContent += "[Event \"\"]\n";
                    pgnContent += `[Title \"${fileName}\"]\n`;
                    pgnContent += `[Date \"${new Date().toISOString().split('T')[0]}\"]\n`;
                    pgnContent += "[Round \"\"]\n";
                    pgnContent += "[RedName \"\"]\n";
                    pgnContent += "[BlackName \"\"]\n";
                    pgnContent += "[Result \"未知\"]\n";
                    pgnContent += `[FEN \"${fen}\"]\n`;
                    pgnContent += "[Table \"0\"]\n\n";
                    pgnContent += pgnMoves;
                    pgnContent += "\n";

                    // 6. 复制到剪贴板
                    navigator.clipboard.writeText(pgnContent).then(() => {
                        new Notice('英文PGN格式已复制到剪贴板');
                    }).catch(err => {
                        console.error('复制失败:', err);
                        new Notice('复制失败，请手动复制');
                    });
                    break;
                }
                case 'identifyOpening': {
                    // 提取auto参数，标记是否为自动识别
                    const isAuto = data?.auto || false;
                    
                    // 1. 使用传递过来的PGN（如果有），否则生成当前路径的英文PGN
                    let pgnText = data?.pgn || "";
                    
                    // 如果没有传递PGN，则生成
                    if (!pgnText && host.currentNode && host.currentNode.id !== 'node-root') {
                        // 构建从根节点到当前选中节点的路径
                        let currentNode = host.currentNode;
                        const pathNodes = [];
                        
                        // 从当前节点向上回溯到根节点
                        while (currentNode) {
                            pathNodes.unshift(currentNode);
                            if (currentNode.parentID) {
                                currentNode = host.nodeMap.get(currentNode.parentID);
                            } else {
                                break;
                            }
                        }
                        
                        // 生成PGN
                        let result = '';
                        let currentStepNum = 1;
                        
                        for (let i = 1; i < pathNodes.length; i++) {
                            const node = pathNodes[i];
                            if (node && node.data) {
                                if (node.side === 'red') {
                                    result += `${currentStepNum}. ${node.data.ICCS}`;
                                } else if (node.side === 'black') {
                                    result += `${node.data.ICCS}`;
                                }
                                
                                if (i < pathNodes.length - 1) {
                                    result += ` `;
                                }
                                
                                // 更新步数
                                if (node.side === 'red') {
                                    currentStepNum++;
                                }
                            }
                        }
                        
                        pgnText = result;
                    }
                    
                    // 2. 预检：检查是否有坐标格式
                    if (!pgnText || !/[A-I][0-9]-[A-I][0-9]/i.test(pgnText)) {
                        if (!isAuto) { // 自动识别时不显示错误提示
                            new Notice('⚠️ 未检测到有效坐标着法 (例如 B2-B4)');
                        }
                        break;
                    }
                    
                    // 3. 发起并行请求
                    (async () => {
                        try {
                            // 获取配置的NAS地址
                            const nasAddress1 = host.settings?.nasAddress1 || 'http://192.168.50.159:5050/api/identify';
                            const nasAddress2 = host.settings?.nasAddress2 || '';
                            
                            // 构建请求函数
                            const createRequest = (url: string) => {
                                return requestUrl({
                                    url: url,
                                    method: 'POST',
                                    contentType: 'application/json',
                                    body: JSON.stringify({ pgn_text: pgnText })
                                });
                            };
                            
                            // 准备请求数组
                            const requests: Promise<any>[] = [createRequest(nasAddress1)];
                            if (nasAddress2) {
                                requests.push(createRequest(nasAddress2));
                            }
                            
                            // 并行发送请求，使用Promise.race获取第一个完成的结果
                            let response;
                            if (requests.length > 1) {
                                // 处理多个请求的情况，确保即使一个失败也能返回另一个的结果
                                response = await Promise.race(requests.map(promise => 
                                    promise.catch(() => new Promise(() => {}))
                                ));
                                
                                // 检查是否所有请求都失败了
                                if (!response) {
                                    throw new Error('所有NAS地址都无法连接');
                                }
                            } else {
                                // 只有一个请求的情况
                                response = await createRequest(nasAddress1);
                            }
                            
                            const res = response.json;
                            if (res.success) {
                                // 构建完整的识别结果通知
                                let noticeMessage = `开局：${res.opening}`;
                                if (res.variation && res.variation.trim() !== '') {
                                    noticeMessage += `\n分支：${res.variation}`;
                                }
                                
                                // 检查识别结果是否变化
                                const currentResult = { opening: res.opening, variation: res.variation || '' };
                                const resultChanged = !lastOpeningResult || 
                                    lastOpeningResult.opening !== currentResult.opening || 
                                    lastOpeningResult.variation !== currentResult.variation;
                                
                                // 只有当结果变化时才显示通知
                                if (resultChanged) {
                                    new Notice(noticeMessage);
                                    // 更新缓存
                                    lastOpeningResult = currentResult;
                                    lastPGN = data?.pgn || pgnText;
                                }
                                
                                // 只有手动识别时才添加注释
                                if (!isAuto) {
                                    // 将开局名称添加到当前选定的节点上，如果没选择则添加到第一步棋上
                                    let targetNode;
                                    if (host.currentPath.length > 1) {
                                        // 获取当前选定的节点
                                        const currentNodeId = host.currentNode?.id;
                                        if (currentNodeId) {
                                            targetNode = host.nodeMap.get(currentNodeId);
                                        }
                                        
                                        // 如果当前是根节点，则使用第一步棋
                                        if (!targetNode || targetNode.id === 'node-root') {
                                            const firstMoveNodeId = host.currentPath[1];
                                            targetNode = host.nodeMap.get(firstMoveNodeId);
                                        }
                                    }
                                    
                                    if (targetNode) {
                                        if (!targetNode.comments) {
                                            targetNode.comments = [];
                                        }
                                        
                                        // 移除已有的开局识别备注
                                        targetNode.comments = targetNode.comments.filter((comment: string) => !comment.startsWith('开局：') && !comment.startsWith('分支：'));
                                        
                                        // 添加新的开局识别备注
                                        targetNode.comments.push(`开局：${res.opening}（${res.ecco}）`);
                                        
                                        // 如果有分支，则添加分支信息
                                        if (res.variation && res.variation.trim() !== '') {
                                            targetNode.comments.push(`分支：${res.variation}`);
                                        }
                                        
                                        // 触发更新事件
                                        eventBus.emit('updateUI');
                                        eventBus.emit('updatePGN');
                                    }
                                }
                            } else {
                                if (!isAuto) { // 自动识别时不显示错误提示
                                    new Notice(`❌ 引擎识别失败: ${res.error || "未知错误"}`);
                                }
                            }
                        } catch (err) {
                            if (!isAuto) { // 自动识别时不显示错误提示
                                new Notice('🔥 无法连接到 NAS。请检查：1.内网IP是否变动；2.NAS容器是否启动。');
                            }
                        }
                    })();
                    break;
                }
                case 'copyFEN': {
                    const board = host.board!;
                    const turn = host.currentTurn;
                    const fen = genFENFromBoard(board, turn === 'red' ? 'black' : 'red');
                    navigator.clipboard.writeText(fen).then(() => {
                        new Notice('局面FEN已复制到剪贴板');
                    }).catch(err => {
                        console.error('复制失败:', err);
                        new Notice('复制失败，请手动复制');
                    });
                    break;
                }
                case 'setPathColor': {
                    if (!host.currentNode) break;
                    const node = host.currentNode;
                    if (!node.comments) node.comments = [];
                    const color = data;
                    const existingColorIndex = node.comments.findIndex((c: string) => c === color);
                    if (existingColorIndex !== -1) {
                        node.comments.splice(existingColorIndex, 1);
                    } else {
                        node.comments = node.comments.filter((c: string) => !c.startsWith('flag-'));
                        node.comments.push(color);
                    }
                    break;
                }
                case 'clearAllPathColor': {
                    for (const node of host.nodeMap.values()) {
                        if (node.comments) {
                            node.comments = node.comments.filter((c: string) => !c.startsWith('flag-'));
                        }
                    }
                    break;
                }
            }

            eventBus.emit('updateUI')
            eventBus.emit('updatePGN')
        })
    }
}


registerPGNViewModule('actions', ActionsModule);

function processTree(root: ChessNode, initialStepNum: number): string {
    let result = '';
    let currentNode = root;
    let currentStepNum = initialStepNum;

    while (currentNode) {
        if (currentNode.side === 'red') {
            result += `${currentStepNum}. ${currentNode.data!.ICCS}`;
        } else if (currentNode.side === 'black') {
            result += `${currentNode.data!.ICCS}`;
        }

        // 添加节点注释
        if (currentNode.comments?.length) {
            for (const comment of currentNode.comments) {
                result += ` {${comment}}`;
            }
        }

        if (currentNode.children[0]) {
            currentNode = currentNode.children[0];
            currentStepNum = currentNode.side === 'red' ? currentStepNum + 1 : currentStepNum;
            result += `\n`;
        } else {
            break;
        }
    }

    return result;
}

function stringifyPGN(root: ChessNode): string {

    let nodeBrothers = genNodeBrothers(root)
    function genNodeBrothers(root: ChessNode): Map<ChessNode, ChessNode[]> {
        const nodeBrothers = new Map<ChessNode, ChessNode[]>();

        function dfs(node: ChessNode) {
            if (node.children.length > 1) {
                const [mainChild, ...siblings] = node.children;
                nodeBrothers.set(mainChild, siblings);
            }

            for (const child of node.children) {
                dfs(child);
            }
        }

        dfs(root);
        return nodeBrothers;
    }

    function walk(node: ChessNode, stepNum: number, indent: string = ''): string {
        let result = '';

        if (node.side === 'red') {
            result += `${indent}${stepNum}. ${node.data!.ICCS}`;
        } else if (node.side === 'black') {
            result += `${indent}${node.data!.ICCS}`;
        }

        // 递归主线（第一个子节点）
        if (node.children[0]) {
            const next = node.children[0];
            const nextStepNum = next.side === 'red' ? stepNum + 1 : stepNum;
            result += `\n${walk(next, nextStepNum, indent)}`;
        }

        return result;
    }

    function processNode(node: ChessNode, stepNum: number): string {
        let result = '';

        if (node.side === 'red') {
            result += `${stepNum}. ${node.data!.ICCS}`;
        } else if (node.side === 'black') {
            result += `${node.data!.ICCS}`;
        }

        // 添加节点注释
        if (node.comments?.length) {
            for (const comment of node.comments) {
                result += ` {${comment}}`;
            }
        }

        // 分支（兄弟节点）
        const brothers = nodeBrothers.get(node);
        if (brothers?.length) {
            for (const brother of brothers) {
                result += `\n(`;
                // 使用 processNode 而不是 processTree，这样才能处理嵌套变招
                result += `\n${processNode(brother, stepNum)}`;
                result += `\n)`;
            }
        }

        // 递归主线（第一个子节点）
        if (node.children[0]) {
            const next = node.children[0];
            const nextStepNum = next.side === 'red' ? stepNum + 1 : stepNum;
            result += `\n${processNode(next, nextStepNum)}`;
        }

        return result;
    }

    // 处理根节点注释
    let result = '';
    if (root.comments?.length) {
        for (const c of root.comments) {
            result += `{${c}}\n\n`;
        }
    }

    // 处理主变
    if (root.children[0]) {
        result += processNode(root.children[0], 1);
    }

    return result;

}
