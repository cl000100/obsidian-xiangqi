import type { IBoard, IMove, IOptions, ITurn, PieceType } from "../types";
import { PIECE_CHARS } from "../types";


export function parseSource(source: string): {
    haveFEN: boolean;
    board: IBoard;
    PGN: IMove[];
    firstTurn: ITurn;
    options: IOptions;
    isPikafishUrl?: boolean;
} {
    const options = parseOption(source);

    const pikafishData = parsePikafishUrl(source);
    if (pikafishData) {
        return { ...pikafishData, options, isPikafishUrl: true };
    }

    let haveFEN = false;
    let fen =
        source.match(
            /([rnbakcpRNBAKCP1-9]+\/){9}[rnbakcpRNBAKCP1-9]+(?:\s+[wb])?/,
        )?.[0];
    if (!fen) {
        fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR";
    } else {
        haveFEN = true;
    }
    // 1. 解析 FEN 字符串
    const { board, turn } = loadBoardFromFEN(fen);
    const firstTurn = turn === "b" ? "black" : "red";
    // 2. 提取最后一段走法（去掉注释和换行）
    const PGNString = source.match(/\b[A-Z]\d-[A-Z]\d\b/g) || [];
    let tmpBoard: IBoard = board.map((row) => [...row]);
    const PGN = PGNString.map((string) => {
        const move = parseICCS(string, tmpBoard);
        move.WXF = getWXF(move, tmpBoard);
        tmpBoard[move.to.x][move.to.y] = tmpBoard[move.from.x][move.from.y];
        tmpBoard[move.from.x][move.from.y] = null;
        return move;
    });
    return {
        haveFEN,
        board,
        PGN,
        firstTurn,
        options
    };
}

function parsePikafishUrl(source: string): {
    haveFEN: boolean;
    board: IBoard;
    PGN: IMove[];
    firstTurn: ITurn;
} | null {
    // 匹配 https://xiangqiai.com/#/ 之后的所有内容，直到换行或结束
    const match = source.match(/https:\/\/xiangqiai\.com\/#\/([^\s\n]+)/);
    if (!match) return null;

    let raw = match[1];
    try {
        raw = decodeURIComponent(raw);
    } catch (e) {
        // ignore error
    }

    // 分割 FEN 和 moves
    // URL 格式通常为: <FEN> w moves <move1><move2>...
    // 或者 <FEN> w moves <move1> <move2> ...
    // 使用正则分割更稳健
    const parts = raw.split(/\s+moves\s+/);
    let fenPart = parts[0];
    const movesStr = parts[1] || "";

    const { board, turn } = loadBoardFromFEN(fenPart);
    const firstTurn = turn === "b" ? "black" : "red";

    let PGN: IMove[] = [];
    if (movesStr) {
        let tmpBoard: IBoard = board.map((row) => [...row]);

        // 匹配所有 moves，格式为 [a-i]\d[a-i]\d
        const moveMatches = movesStr.match(/[a-i]\d[a-i]\d/gi);

        if (moveMatches) {
            for (const moveStr of moveMatches) {
                const fromFile = moveStr[0].toUpperCase();
                const fromRank = moveStr[1];
                const toFile = moveStr[2].toUpperCase();
                const toRank = moveStr[3];

                const iccs = `${fromFile}${fromRank}-${toFile}${toRank}`;

                const move = parseICCS(iccs, tmpBoard);
                move.WXF = getWXF(move, tmpBoard);

                if (tmpBoard[move.to.x] && tmpBoard[move.to.x][move.to.y] !== undefined) {
                    tmpBoard[move.to.x][move.to.y] = tmpBoard[move.from.x][move.from.y];
                    tmpBoard[move.from.x][move.from.y] = null;
                }

                PGN.push(move);
            }
        }
    }

    return {
        haveFEN: true,
        board,
        PGN,
        firstTurn
    };
}

export function loadBoardFromFEN(fen: string): { board: IBoard; turn: string } {
    const board: IBoard = Array.from({ length: 9 }, () => Array(10).fill(null));
    const [position, turn] = fen.trim().split(/\s+/);
    const rows = position.split("/");
    rows.forEach((row, y) => {
        let x = 0;
        for (const char of row) {
            if (/[1-9]/.test(char)) {
                x += parseInt(char);
            } else if (/[a-zA-Z]/.test(char)) {
                board[x][y] = char as PieceType;
                x++;
            }
        }
    });
    return { board, turn };
}

/**
 * 从字符串中解析预定义的选项（viewOnly/rotated/showPGN）
 * @param source 输入的字符串
 * @returns 包含已解析选项的对象（仅包含匹配到的选项）
 */
export function parseOption(source: string): IOptions {
    const options: IOptions = {};
    const optionPatterns = [
        { key: "protected", regex: /\b(protected|P)\s*[:：]\s*(true|false)\s*/i },
        { key: "rotated", regex: /\b(rotated|r)\s*[:：]\s*(true|false)\s*/i },
        // { key: 'showPGN', regex: /\b(showPGN|s)\s*[:：]\s*(true|false)\s*/i }
    ];

    optionPatterns.forEach(({ key, regex }) => {
        const match = source.match(regex);
        if (match) {
            options[key as keyof IOptions] = match[2].toLowerCase() === "true";
        }
    });

    return options;
}

export function parseICCS(ICCS: string, tmpBoard: IBoard): IMove {
    // 解析 PGN 字符串为 IMove 数组
    // 解析走法，例如 "H2-D2" -> 起点和终点
    const [fromSquare, toSquare] = ICCS.split("-");
    const fromX = fromSquare.charCodeAt(0) - "A".charCodeAt(0);
    const fromY = 9 - parseInt(fromSquare[1]); // 修正 Y 坐标，从下往上数
    const toX = toSquare.charCodeAt(0) - "A".charCodeAt(0);
    const toY = 9 - parseInt(toSquare[1]); // 修正 Y 坐标，从下往上数
    const from = { x: fromX, y: fromY };
    const to = { x: toX, y: toY };
    const type = tmpBoard[fromX][fromY];
    if (!type) {
        return { from, to, ICCS };
    }
    return { type, from, to, ICCS };
}
/**
 * 将 { from: { x, y }, to: { x, y } } 转换为 "A0-B7" 格式
 * @param move 包含 from 和 to 的对象，例如 { from: { x: 0, y: 0 }, to: { x: 1, y: 7 } }
 * @returns 返回 "A0-B7" 格式的字符串
 */
export function getICCS(move: IMove): string {
    // 校验输入
    if (
        move.from.x == null ||
        move.from.y == null ||
        move.to.x == null ||
        move.to.y == null
    ) {
        throw new Error("Invalid move: x and y must be numbers");
    }

    // 将 x 转换为大写字母（0=A, 1=B, ..., 7=H）
    const xToLetter = (x: number): string => {
        if (x < 0 || x > 25)
            throw new Error(`x must be between 0 and 25, got ${x}`);
        return String.fromCharCode(65 + x); // 65 = 'A' 的 ASCII 码
    };

    const fromStr = `${xToLetter(move.from.x)}${9 - move.from.y}`;
    const toStr = `${xToLetter(move.to.x)}${9 - move.to.y}`;

    return `${fromStr}-${toStr}`;
}

export function getWXF(move: IMove, tmpBoard: IBoard): string {

    const MOVE_TYPES = {
        horizontal: "平",
        forward: "进",
        backward: "退",
    };

    const NUMBERS_RED = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const NUMBERS_BLACK = ["１", "２", "３", "４", "５", "６", "７", "８", "９"];

    const { from, to } = move;
    const piece = tmpBoard[from.x][from.y];
    if (!piece) return "";

    const isRed = piece === piece.toUpperCase();
    const pieceType = piece.toLowerCase();
    const numbers = isRed ? NUMBERS_RED : NUMBERS_BLACK;
    const BOARD: IBoard = Array.from({ length: 9 }, () => Array(10).fill(null));
    let fromx = from.x;
    let fromy = from.y;
    let tox = to.x;
    let toy = to.y;
    if (isRed) {
        for (let x = 0; x < 9; x++) {
            for (let y = 0; y < 10; y++) {
                BOARD[x][y] = tmpBoard[8 - x][9 - y];
            }
        }
        fromx = 8 - from.x;
        fromy = 9 - from.y;
        tox = 8 - to.x;
        toy = 9 - to.y;
    } else {
        for (let x = 0; x < 9; x++) {
            for (let y = 0; y < 10; y++) {
                BOARD[x][y] = tmpBoard[x][y];
            }
        }
    }

    const FRONT_LABELS = ["后", "中", "前"];
    const NUMBER_LABELS = ["一", "二", "三", "四", "五"];

    function getIndexLabel(index: number, count: number) {
        if (count === 2) return index === 0 ? "后" : "前";
        if (count === 3) return FRONT_LABELS[index];
        if (count >= 4) return NUMBER_LABELS[count - index - 1];
        return "";
    }
    function getPawnPrefix(
        piece: PieceType,
        fromx: number,
        fromy: number,
        BOARD: IBoard,
    ) {
        const colMap = new Map<number, number[]>();

        // 收集所有兵的位置
        for (let x = 0; x < 9; x++) {
            for (let y = 0; y < 10; y++) {
                if (BOARD[x][y] === piece) {
                    (colMap.get(x) ?? colMap.set(x, []).get(x)!).push(y);
                }
            }
        }

        // 找出“同列多个兵”的列
        const multiCols = [...colMap.entries()]
            .filter(([, ys]) => ys.length > 1)
            .map(([x]) => x);

        // 没有冲突，直接用列号
        if (!multiCols.includes(fromx)) {
            return PIECE_CHARS[piece] + numbers[fromx];
        }

        const ys = colMap.get(fromx)!;
        const index = ys.indexOf(fromy);

        // 只有一列有多个兵
        if (multiCols.length === 1) {
            return getIndexLabel(index, ys.length) + PIECE_CHARS[piece];
        }

        // 两列都有多个兵（按规则编号）
        if (multiCols.length === 2) {
            const [leftCol, rightCol] = multiCols;

            let offset = 0;
            if (fromx === rightCol) {
                offset = colMap.get(leftCol)!.length;
            }

            const label = NUMBER_LABELS[offset + (ys.length - index - 1)];
            return label + PIECE_CHARS[piece];
        }

        // fallback
        return PIECE_CHARS[piece] + numbers[fromx];
    }

    function getNormalPrefix(
        piece: PieceType,
        fromx: number,
        fromy: number,
        BOARD: IBoard,
    ) {
        const sameCol: number[] = [];

        for (let y = 0; y < 10; y++) {
            if (BOARD[fromx][y] === piece) {
                sameCol.push(y);
            }
        }

        if (sameCol.length === 1) {
            return PIECE_CHARS[piece] + numbers[fromx];
        }

        if (sameCol.length === 2) {
            return sameCol[0] === fromy
                ? "后" + PIECE_CHARS[piece]
                : "前" + PIECE_CHARS[piece];
        }

        return PIECE_CHARS[piece] + numbers[fromx];
    }

    let pre = "";

    if (pieceType === "a" || pieceType === "b") {
        pre = PIECE_CHARS[piece] + numbers[fromx];
    } else if (pieceType === "p") {
        pre = getPawnPrefix(piece, fromx, fromy, BOARD);
    } else {
        pre = getNormalPrefix(piece, fromx, fromy, BOARD);
    }


    // 确定移动类型和距离
    let moveType: string;
    let dest: string;

    if (fromx === tox) {
        // 纵向移动
        const delta = toy - fromy;
        moveType = delta > 0 ? MOVE_TYPES.forward : MOVE_TYPES.backward;
        dest = numbers[Math.abs(delta) - 1];
    } else if (fromy === toy) {
        // 横向移动
        moveType = MOVE_TYPES.horizontal;
        dest = numbers[tox];
    } else {
        moveType = fromy < toy ? MOVE_TYPES.forward : MOVE_TYPES.backward;
        dest = numbers[tox];
    }
    return `${pre}${moveType}${dest}`;
}

export function parseWXF(wxf: string, board: IBoard, isRed: boolean): IMove | null {
    const NUMBERS = isRed
        ? ["一", "二", "三", "四", "五", "六", "七", "八", "九"]
        : ["１", "２", "３", "４", "５", "６", "７", "８", "９"];
    const NUM_TO_INDEX = Object.fromEntries(NUMBERS.map((n, i) => [n, i]));

    // 检测格式：前炮平五、车二进六、马八进七等
    const match = wxf.match(/^([前中后]?)([车马炮兵卒相仕象士将帅])([平进退])([一二三四五六七八九１２３４５６７８９])$/);
    if (!match) return null;

    const [, positionHint, pieceChar, action, destChar] = match;
    const destIndex = NUM_TO_INDEX[destChar];
    if (destIndex === undefined) return null;

    // 构造棋子 unicode 对应字符
    const targetPiece = Object.entries(PIECE_CHARS).find(
        ([key, val]) => val === pieceChar && (isRed === (key === key.toUpperCase()))
    )?.[0];
    if (!targetPiece) return null;

    // 镜像转换
    const flipX = (x: number) => (isRed ? 8 - x : x);
    const flipY = (y: number) => (isRed ? 9 - y : y);
    const realBoard: IBoard = isRed
        ? Array.from({ length: 9 }, (_, x) =>
            Array.from({ length: 10 }, (_, y) => board[8 - x][9 - y])
        )
        : board;

    // 找出所有匹配棋子的坐标
    const candidates: { x: number; y: number }[] = [];
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 10; y++) {
            if (realBoard[x][y] === targetPiece) {
                candidates.push({ x, y });
            }
        }
    }

    // 进一步筛选列或行（车八进三 = 车在第 7 列 = x==7）
    let from: { x: number; y: number } | null = null;
    let to: { x: number; y: number } | null = null;

    // 确定起始位置
    if (!positionHint) {
        // 直接数字，如"车二进六"
        for (const p of candidates) {
            if (p.x === NUM_TO_INDEX[match[2]]) {
                from = p;
                break;
            }
        }
    } else {
        // 有 前中后，先按x排序（纵向）
        const sorted = candidates.sort((a, b) => a.y - b.y);
        if (sorted.length >= 2) {
            if (positionHint === "前") from = sorted[sorted.length - 1];
            if (positionHint === "中" && sorted.length >= 3) from = sorted[1];
            if (positionHint === "后") from = sorted[0];
        }
    }

    if (!from) return null;

    // 计算目标坐标
    if (action === "平") {
        to = { x: destIndex, y: from.y };
    } else if (action === "进") {
        const dy = isRed ? -1 : 1;
        if (["兵", "卒"].includes(pieceChar) || ["马", "象", "相", "士", "仕"].includes(pieceChar)) {
            // 马、兵进斜线：目标 x = destIndex, y +-1
            to = { x: destIndex, y: from.y + dy };
        } else {
            to = { x: from.x, y: from.y + (destIndex + 1) * dy };
        }
    } else if (action === "退") {
        const dy = isRed ? 1 : -1;
        if (["兵", "卒"].includes(pieceChar) || ["马", "象", "相", "士", "仕"].includes(pieceChar)) {
            to = { x: destIndex, y: from.y + dy };
        } else {
            to = { x: from.x, y: from.y + (destIndex + 1) * dy };
        }
    }

    if (!to) return null;

    // 镜像还原坐标
    const finalFrom = {
        x: flipX(from.x),
        y: flipY(from.y),
    };
    const finalTo = {
        x: flipX(to.x),
        y: flipY(to.y),
    };

    return { from: finalFrom, to: finalTo };
}

export function genFENFromBoard(board: IBoard, turn: ITurn): string {
    // board[x][y]，x为列，y为行
    const rows: string[] = [];
    for (let y = 0; y < 10; y++) {
        let fenRow = "";
        let empty = 0;
        for (let x = 0; x < 9; x++) {
            const cell = board[x][y];
            if (!cell) {
                empty++;
            } else {
                if (empty > 0) {
                    fenRow += empty;
                    empty = 0;
                }
                fenRow += cell;
            }
        }
        if (empty > 0) fenRow += empty;
        rows.push(fenRow);
    }
    const fen = rows.join("/");
    return `${fen} ${turn === "red" ? "w" : "b"}`;
}

/**
 * 将旗标标记转换为中文
 * @param flag 旗标标记
 * @returns 对应的中文注释
 */
function convertFlagToChinese(flag: string): string {
    const flagMap: Record<string, string> = {
        "R+": "优势",
        "B+": "劣势",
        "=": "均势",
        "?": "关键",
        "!": "妙手",
        "?!": "骗着",
        "R#": "红胜",
        "B#": "黑胜"
    };
    const pathColorMap: Record<string, string> = {
        "flag-red": "[红线]",
        "flag-green": "[绿线]",
        "flag-blue": "[蓝线]",
        "flag-yellow": "[黄线]"
    };
    return pathColorMap[flag] || flagMap[flag] || flag;
}

/**
 * 将中文注释转换回旗标标记
 * @param text 中文注释
 * @returns 对应的旗标标记
 */
function convertChineseToFlag(text: string): string {
    const chineseToFlag: Record<string, string> = {
        "[红线]": "flag-red",
        "[绿线]": "flag-green",
        "[蓝线]": "flag-blue",
        "[黄线]": "flag-yellow"
    };
    return chineseToFlag[text] || text;
}

/**
 * 生成标准 PGN 格式的棋谱
 * @param board 棋盘状态
 * @param turn 轮到哪方走棋
 * @param moves 走法记录
 * @returns PGN 格式的字符串
 */
export function genPGNFromMoves(board: IBoard, turn: ITurn, moves: IMove[], fileName?: string): string {
    // 生成FEN值
    const fen = genFENFromBoard(board, turn);
    
    // PGN 格式基本结构
    let pgnContent = "[Game \"Chinese Chess\"]\n";
    pgnContent += "[Event \"\"]\n";
    pgnContent += `[Title \"${fileName || '残局'}\"]\n`;
    pgnContent += `[Date \"${new Date().toISOString().split('T')[0]}\"]\n`;
    pgnContent += "[Round \"\"]\n";
    pgnContent += "[RedName \"\"]\n";
    pgnContent += "[BlackName \"\"]\n";
    pgnContent += "[Result \"未知\"]\n";
    pgnContent += `[FEN \"${fen}\"]\n`;
    pgnContent += "[Table \"0\"]\n\n";

    // 生成走法记录
    let tmpBoard: IBoard = board.map((row) => [...row]);
    let currentTurn = turn;
    let moveNumber = 1;
    
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const iccs = getICCS(move);
        
        if (currentTurn === 'red') {
            pgnContent += `${moveNumber}. ${iccs}`;
            moveNumber++;
        } else {
            pgnContent += `${iccs}`;
        }
        
        // 添加注释（包括旗标标记，转换为中文）
        if (move.comments && move.comments.length > 0) {
            for (const comment of move.comments) {
                const chineseComment = convertFlagToChinese(comment);
                pgnContent += ` {${chineseComment}}`;
            }
        }
        
        pgnContent += " ";
        
        // 更新临时棋盘
        tmpBoard[move.to.x][move.to.y] = tmpBoard[move.from.x][move.from.y];
        tmpBoard[move.from.x][move.from.y] = null;
        
        // 切换走棋方
        currentTurn = currentTurn === 'red' ? 'black' : 'red';
    }

    pgnContent += "*\n";

    return pgnContent;
}

function pgnCoordToUbb(pgnMove: string): string | null {
    if (!pgnMove) return null;
    const clean = pgnMove.replace(/[^A-I0-9]/gi, '').toUpperCase();
    if (clean.length !== 4) return null;
    try {
        const cols = "ABCDEFGHI";
        const x1 = cols.indexOf(clean[0]);
        const y1 = 9 - parseInt(clean[1]);
        const x2 = cols.indexOf(clean[2]);
        const y2 = 9 - parseInt(clean[3]);
        return `${x1}${y1}${x2}${y2}`;
    } catch {
        return null;
    }
}

function ubbCoordToPgn(ubbMove: string): string {
    if (!ubbMove || ubbMove.length !== 4) return "????";
    try {
        const cols = "ABCDEFGHI";
        const x1 = parseInt(ubbMove[0]);
        const y1 = 9 - parseInt(ubbMove[1]);
        const x2 = parseInt(ubbMove[2]);
        const y2 = 9 - parseInt(ubbMove[3]);
        const src = `${cols[x1]}${y1}`;
        const dst = `${cols[x2]}${y2}`;
        return `${src}-${dst}`;
    } catch {
        return "????";
    }
}

interface UBBMove {
    moveStr: string;
    ubbCode: string;
    comment: string;
    children: UBBMove[];
}

interface UBBComment {
    branchId: number;
    ply: number;
    text: string;
}

interface UBBVariation {
    srcBranchId: number;
    forkPly: number;
    newBranchId: number;
    content: string;
}

export function genUBBFromMoves(
    board: IBoard,
    turn: ITurn,
    moves: IMove[],
    nodeMap?: Map<string, any>,
    currentPath?: string[],
    tags?: Record<string, string>,
    fileName?: string
): string {
    const defaultTags: Record<string, string> = {
        Event: "",
        Title: fileName || '残局',
        Date: new Date().toISOString().replace('T', ' ').split('.')[0],
        Round: "",
        Red: "",
        Black: "",
        Result: "未知"
    };

    const mergedTags = { ...defaultTags, ...tags };

    let branchCounter = 0;
    const ubbTags: string[] = [];
    const allComments: Map<string, string> = new Map();

    function buildTreeFromNodeMap(nodeMap: Map<string, any>, rootId: string): any {
        const root = nodeMap.get(rootId);
        if (!root) return null;

        // 检查多种可能的注释属性
        let comment = "";
        if (root.comments && root.comments.length > 0) {
            comment = root.comments.map((c: string) => convertFlagToChinese(c)).join(" ");
        } else if (root.comment) {
            comment = convertFlagToChinese(root.comment);
        }

        const node: any = {
            moveStr: root.data ? getICCS(root.data) : "",
            ubbCode: root.data ? pgnCoordToUbb(getICCS(root.data)) || "" : "",
            comment,
            children: []
        };

        for (const childId of root.children) {
            const childNode = buildTreeFromNodeMap(nodeMap, childId.id);
            if (childNode) {
                node.children.push(childNode);
            }
        }

        return node;
    }

    function traverseBranch(parentNode: any, branchId: number, startPly: number): string {
        const moves: string[] = [];
        let current = parentNode;
        let currentPly = startPly;
        
        while (current.children.length > 0) {
            const node = current.children[0];
            currentPly++;
            
            if (node.ubbCode) {
                moves.push(node.ubbCode);
                if (node.comment) {
                    allComments.set(`${branchId}_${currentPly}`, node.comment);
                }
            }
            
            if (current.children.length > 1) {
                for (let i = 1; i < current.children.length; i++) {
                    const varNode = current.children[i];
                    branchCounter++;
                    const newId = branchCounter;
                    const forkPly = currentPly;
                    
                    // 为变招添加完整的坐标序列
                    let varStr = "";
                    let varCurrent = varNode;
                    let varPly = forkPly;
                    
                    // 遍历变招的所有着法，确保包含完整的坐标序列
                    while (varCurrent) {
                        if (varCurrent.ubbCode) {
                            varStr += varCurrent.ubbCode;
                            // 为变招节点添加注释
                            if (varCurrent.comment) {
                                allComments.set(`${newId}_${varPly}`, varCurrent.comment);
                            }
                        }
                        
                        // 移动到下一个节点
                        if (varCurrent.children.length > 0) {
                            varCurrent = varCurrent.children[0];
                            varPly++;
                        } else {
                            varCurrent = null;
                        }
                    }
                    
                    const tag = `[DhtmlXQ_move_${branchId}_${forkPly}_${newId}]${varStr}[/DhtmlXQ_move_${branchId}_${forkPly}_${newId}]`;
                    ubbTags.push(tag);
                }
            }
            
            current = node;
        }
        
        return moves.join("");
    }

    let rootNode: any;
    if (nodeMap && nodeMap.size > 0) {
        const rootId = Array.from(nodeMap.keys())[0];
        rootNode = buildTreeFromNodeMap(nodeMap, rootId);
    } else {
        rootNode = { moveStr: "", ubbCode: "", comment: "", children: [] };
        let current = rootNode;
        for (const move of moves) {
            const iccs = getICCS(move);
            const ubbCode = pgnCoordToUbb(iccs) || "";
            const comment = move.comments && move.comments.length > 0 
                ? move.comments.map(c => convertFlagToChinese(c)).join(" ") 
                : "";
            
            const node: any = {
                moveStr: iccs,
                ubbCode,
                comment,
                children: []
            };
            current.children.push(node);
            current = node;
        }
    }

    const mainStr = traverseBranch(rootNode, 0, 0);

    // 生成UBB初始局面字符串 (Binit格式)
    function generateUBBInit(board: IBoard): string {
        // 1. 扫描棋盘，收集所有棋子的位置
        const foundPieces: Record<string, Array<[number, number]>> = {
            'R': [], 'N': [], 'B': [], 'A': [], 'K': [], 'C': [], 'P': [],
            'r': [], 'n': [], 'b': [], 'a': [], 'k': [], 'c': [], 'p': []
        };
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = board[x][y];
                if (piece && foundPieces[piece]) {
                    foundPieces[piece].push([x, y]);
                }
            }
        }
        
        // 2. 定义Binit的固定顺序 (32个位置)
        const ORDER = [
            // 红方: RNBAKABNRCCPPPPP
            'R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R', 'C', 'C', 'P', 'P', 'P', 'P', 'P',
            // 黑方: rnbakabnrccppppp
            'r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r', 'c', 'c', 'p', 'p', 'p', 'p', 'p'
        ];
        
        // 3. 按照顺序填充Binit
        let ubbInit = "";
        const pieceCounters: Record<string, number> = {
            'R': 0, 'N': 0, 'B': 0, 'A': 0, 'K': 0, 'C': 0, 'P': 0,
            'r': 0, 'n': 0, 'b': 0, 'a': 0, 'k': 0, 'c': 0, 'p': 0
        };
        
        for (const piece of ORDER) {
            if (foundPieces[piece] && pieceCounters[piece] < foundPieces[piece].length) {
                const [x, y] = foundPieces[piece][pieceCounters[piece]];
                ubbInit += `${x}${y}`;
                pieceCounters[piece]++;
            } else {
                // 棋子被吃掉了，用99表示
                ubbInit += "99";
            }
        }
        
        return ubbInit;
    }
    
    const lines: string[] = [];
    lines.push("[DhtmlXQ]");
    lines.push(`[DhtmlXQ_binit]${generateUBBInit(board)}[/DhtmlXQ_binit]`);
    lines.push("[DhtmlXQ_firstnum]0[/DhtmlXQ_firstnum]");
    lines.push(`[DhtmlXQ_adddate]${mergedTags.Date}[/DhtmlXQ_adddate]`);
    lines.push(`[DhtmlXQ_editdate][/DhtmlXQ_editdate]`);
    lines.push(`[DhtmlXQ_title]${mergedTags.Title}[/DhtmlXQ_title]`);
    lines.push(`[DhtmlXQ_movelist]${mainStr}[/DhtmlXQ_movelist]`);
    lines.push(`[DhtmlXQ_length]${mainStr.length / 4}[/DhtmlXQ_length]`);
    
    for (const t of ["class", "event", "group", "place", "timerule"]) {
        lines.push(`[DhtmlXQ_${t}][/DhtmlXQ_${t}]`);
    }
    
    lines.push(`[DhtmlXQ_round]${mergedTags.Round}[/DhtmlXQ_round]`);
    lines.push("[DhtmlXQ_table]0[/DhtmlXQ_table]");
    lines.push("[DhtmlXQ_date][/DhtmlXQ_date]");
    lines.push(`[DhtmlXQ_result]${mergedTags.Result}[/DhtmlXQ_result]`);
    lines.push(`[DhtmlXQ_redname]${mergedTags.Red}[/DhtmlXQ_redname]`);
    lines.push(`[DhtmlXQ_blackname]${mergedTags.Black}[/DhtmlXQ_blackname]`);
    
    // 移除全局注释，注释应该在对应着法位置添加

    
    const sortedComments = Array.from(allComments.entries()).sort((a, b) => {
        const [keyA] = a;
        const [keyB] = b;
        const [branchIdA, plyA] = keyA.split('_').map(Number);
        const [branchIdB, plyB] = keyB.split('_').map(Number);
        return branchIdA - branchIdB || plyA - plyB;
    });
    
    for (const [key, text] of sortedComments) {
        lines.push(`[DhtmlXQ_comment${key}]${text}[/DhtmlXQ_comment${key}]`);
    }
    
    for (const tag of ubbTags) {
        lines.push(tag);
    }
    
    lines.push("[DhtmlXQ_generator]棋者象棋[/DhtmlXQ_generator]");
    lines.push("[/DhtmlXQ]");
    
    return lines.join("\n");
}

/**
 * 生成标准中文 PGN 格式的棋谱（使用中文记谱法）
 * @param board 棋盘状态
 * @param turn 轮到哪方走棋
 * @param moves 走法记录
 * @returns 中文 PGN 格式的字符串
 */
export function genChinesePGNFromMoves(board: IBoard, turn: ITurn, moves: IMove[], fileName?: string): string {
    // 生成FEN值
    const fen = genFENFromBoard(board, turn);
    
    // PGN 格式基本结构
    let pgnContent = "[Game \"Chinese Chess\"]\n";
    pgnContent += "[Event \"\"]\n";
    pgnContent += `[Title \"${fileName || '残局'}\"]\n`;
    pgnContent += `[Date \"${new Date().toISOString().split('T')[0]}\"]\n`;
    pgnContent += "[Round \"\"]\n";
    pgnContent += "[RedName \"\"]\n";
    pgnContent += "[BlackName \"\"]\n";
    pgnContent += "[Result \"未知\"]\n";
    pgnContent += `[FEN \"${fen}\"]\n`;
    pgnContent += "[Table \"0\"]\n\n";

    // 生成走法记录（使用中文记谱法）
    let tmpBoard: IBoard = board.map((row) => [...row]);
    let currentTurn = turn;
    let moveNumber = 1;
    
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const wxf = getWXF(move, tmpBoard);
        
        if (currentTurn === 'red') {
            pgnContent += `${moveNumber}. ${wxf}`;
            moveNumber++;
        } else {
            pgnContent += `${wxf}`;
        }
        
        // 添加注释（包括旗标标记，转换为中文）
        if (move.comments && move.comments.length > 0) {
            for (const comment of move.comments) {
                const chineseComment = convertFlagToChinese(comment);
                pgnContent += ` {${chineseComment}}`;
            }
        }
        
        pgnContent += " ";
        
        // 更新临时棋盘
        tmpBoard[move.to.x][move.to.y] = tmpBoard[move.from.x][move.from.y];
        tmpBoard[move.from.x][move.from.y] = null;
        
        // 切换走棋方
        currentTurn = currentTurn === 'red' ? 'black' : 'red';
    }

    pgnContent += "*\n";

    return pgnContent;
}
