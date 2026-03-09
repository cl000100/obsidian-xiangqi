import { tokenize, type Token, type TokenType } from './Tokenizer';
import type { ChessNode, IBoard, IMove, IPosition } from '../../types';
import { loadBoardFromFEN } from '../../utils/parse';
import { DEFAULT_FEN } from '../../types';

export class PGNParser {
    haveFEN: boolean = false;
    tokens: Token[];
    nodeMap: Map<string, ChessNode>;
    currentIndex: number;
    rootNode: ChessNode;
    currentNode: ChessNode;
    nodeId: number;
    currentStep: number = 0;
    currentSide: 'red' | 'black' = 'red';
    tags: Map<string, string> = new Map();

    constructor(input: string | Token[]) {
        this.nodeMap = new Map<string, ChessNode>();
        this.tokens = typeof input === 'string' ? tokenize(input) : input;
        this.currentIndex = 0;
        this.nodeId = 1;

        // 先创建rootNode
        this.rootNode = {
            id: `node-root`,
            data: null,
            step: 0,
            side: null,
            parentID: null,
            children: [],
            mainID: null,
            board: loadBoardFromFEN(DEFAULT_FEN).board,
            comments: []
        };
        this.nodeMap.set(this.rootNode.id, this.rootNode);
        this.currentStep++;

        // 然后设置currentNode
        this.currentNode = this.rootNode;

        while (!this.match('eof')) {
            if (this.match('tag')) {
                this.parseTag(); // 跳过标签
            } else if (this.match('iccs-move')) {
                this.processMove(this.parseICCS(this.consume().value));
            } else if (this.match('wxf-move')) {
                this.processMove(this.parseWXF(this.consume().value));
            } else if (this.match('left-paren')) {
                this.parseVariation();
            } else if (this.match('comment')) {
                this.parseComment();
            } else if (this.match('result')) {
                this.parseResult();
            }
            else {
                this.consume(); // 跳过无法识别的token
            }
        }
    }

    parseTag() {
        const token = this.consume(); // 取出 tag 类型的 token
        const tagText = token.value;

        const match = tagText.match(/^\[(\w+)\s+"([^"]*)"\]$/);
        if (!match) return;

        const [, tagName, tagValue] = match;

        this.tags.set(tagName, tagValue); // 全部收集

        if (tagName.toUpperCase() === 'FEN') {
            // 可选：你可以在这里初始化棋盘
            this.haveFEN = true;
            const { board, turn } = loadBoardFromFEN(tagValue);
            this.currentNode.board = board; // 设置当前节点的棋盘状态
            this.currentSide = turn === 'b' ? 'black' : 'red'; // 设置当前方
        }
    }


    createNode(move: IMove | null): ChessNode {
        const node: ChessNode = {
            id: `node-${this.nodeId++}`,
            data: move,
            step: this.currentStep,
            side: this.currentSide,
            parentID: this.currentNode.id,
            children: [],
            mainID: null,
            comments: []
        };
        this.nodeMap.set(node.id, node);
        return node;
    }

    peek(): Token {
        return this.tokens[this.currentIndex];
    }

    consume(): Token {
        return this.tokens[this.currentIndex++];
    }

    match(type: TokenType): boolean {
        return this.peek().type === type;
    }

    parseICCS(ICCS: string): IMove {
        // 解析 PGN 字符串为 IMove 数组
        // 解析走法，例如 "H2-D2" -> 起点和终点
        const [fromSting, toSting] = ICCS.split("-");
        const fromX = fromSting.charCodeAt(0) - "A".charCodeAt(0);
        const fromY = 9 - parseInt(fromSting[1]); // 修正 Y 坐标，从下往上数
        const toX = toSting.charCodeAt(0) - "A".charCodeAt(0);
        const toY = 9 - parseInt(toSting[1]); // 修正 Y 坐标，从下往上数
        const from = { x: fromX, y: fromY };
        const to = { x: toX, y: toY };
        return { from, to, ICCS };
    }

    parseWXF(wxf: string): IMove {
        // 简化的中文着法解析，实际需要更复杂的处理
        // 这里只是一个示例，实际实现需要完整的中文着法解析逻辑
        return {
            WXF: wxf,
            from: { x: 0, y: 0 }, // 需要实际计算
            to: { x: 0, y: 0 }    // 需要实际计算
        };
    }

    processMove(move: IMove) {
        const newNode = this.createNode(move);
        newNode.data!.type = this.currentNode.board![move.from.x][move.from.y] ?? undefined;
        newNode.board = this.moveBoard(move);
        this.nodeMap.set(newNode.id, newNode);
        this.currentNode.children.push(newNode);
        this.currentNode = newNode;
        this.switchSide();
        this.currentStep++;
    }

    moveBoard(move: IMove): IBoard {
        const newboard = this.currentNode.board!.map(row => row.slice());
        const from = move.from;
        const to = move.to;
        const piece = newboard[from.x][from.y];
        newboard[from.x][from.y] = null; // 清除原位置
        if (newboard[to.x][to.y]) {
            move.captured = newboard[to.x][to.y]; // 记录被吃掉的棋子
        }
        newboard[to.x][to.y] = piece; // 设置新位置
        return newboard;
    }

    parseVariation() {
        this.consume(); // 消费 '('

        // --- 变招解析逻辑 ---
        // 变招是当前节点的替代着法，应该作为当前节点的兄弟节点
        // 但因为 processMove 会把新节点添加到 currentNode.children，
        // 所以我们需要临时把 currentNode 设置为父节点
        
        const variationParent = this.nodeMap.get(this.currentNode.parentID!) || this.currentNode;
        const prevNode = this.currentNode;
        const prevStep = this.currentStep;
        const prevSide = this.currentSide;

        // 切换到父节点，这样变招的第一个着法会作为父节点的子节点
        this.currentNode = variationParent;
        
        // 关键：变招是替代当前节点的，所以颜色应该和当前节点相同
        // 但 currentSide 已经是下一个着法的颜色了（因为 processMove 调用了 switchSide）
        // 所以需要切换回来
        this.currentSide = prevSide === 'red' ? 'black' : 'red';
        // 关键：step 应该减 1，因为变招和原着法是同一步
        // 例如：解析完 C2-I2 后 currentStep=4，但变招 H0-G2 应该和 C2-I2 一样是 step=3
        this.currentStep = prevStep - 1;

        while (!this.match('right-paren') && !this.match('eof')) {
            if (this.match('iccs-move')) {
                const move = this.parseICCS(this.consume().value);
                this.processMove(move);
            } else if (this.match('wxf-move')) {
                const move = this.parseWXF(this.consume().value);
                this.processMove(move);
            } else if (this.match('comment')) {
                this.parseComment();
            } else if (this.match('left-paren')) {
                this.parseVariation();
            } else if (this.match('result')) {
                this.consume();
                break;
            } else {
                this.consume(); // 跳过无法识别的 token
            }
        }

        if (this.match('right-paren')) {
            this.consume();
        }

        // 恢复主线解析
        this.currentNode = prevNode;
        this.currentStep = prevStep;
        this.currentSide = prevSide;
    }

    parseComment() {
        const token = this.consume();
        let comment = token.value
            .replace(/^{|}$/g, '')
            .replace(/^;/, '')
            .trim();

        const chineseToFlagMap: Record<string, string> = {
            "优势": "R+",
            "劣势": "B+",
            "均势": "=",
            "关键": "?",
            "妙手": "!",
            "骗着": "?!",
            "红胜": "R#",
            "黑胜": "B#",
            "[红线]": "flag-red",
            "[绿线]": "flag-green",
            "[蓝线]": "flag-blue",
            "[黄线]": "flag-yellow"
        };

        if (!this.currentNode.comments) {
            this.currentNode.comments = [];
        }

        const parts = comment.split(/\s+/);
        for (const part of parts) {
            if (!part) continue;
            const converted = chineseToFlagMap[part] || part;
            this.currentNode.comments.push(converted);
        }
    }

    parseResult() {
        const token = this.consume();
        let result = '';
        switch (token.value) {
            case "1-0":
                result = "R+";
                break;
            case "0-1":
                result = "B+";
                break;
            case "1/2-1/2":
                result = "=";
                break;
            case "*":
                result = "?";
                break;
        }
        if (!this.currentNode.comments) {
            this.currentNode.comments = [];
        }
        this.currentNode.comments.push(result);
    }

    switchSide() {
        this.currentSide = this.currentSide === 'red' ? 'black' : 'red';
    }

    public getTags(): string {
        const lines: string[] = [];
        for (const [key, value] of this.tags.entries()) {
            lines.push(`[${key} "${value}"]`);
        }
        return lines.join('\n');
    }
    public getRoot(): ChessNode {
        return this.rootNode;
    }
    public getMap(): Map<string, ChessNode> {
        return this.nodeMap;
    }

}