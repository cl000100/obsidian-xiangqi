import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import re

# ==========================================
# 逻辑层 (修复索引偏移 + 符号映射)
# ==========================================
class ChessLogic:
    cols = "ABCDEFGHI" 
    
    # 映射表：补充 + - = 的直接映射
    PGN_TO_CN_MAP = {
        "R#": "红胜", 
        "B#": "黑胜", 
        "R+": "优势", 
        "B+": "劣势",
        "!":  "妙手", 
        "?":  "关键", 
        "=":  "均势"
    }
    
    # 反向映射：在UBB转PGN时，既要支持中文，也要支持 UBB 里可能出现的原始符号 (+, -)
    CN_TO_PGN_MAP = {v: k for k, v in PGN_TO_CN_MAP.items()}
    # 额外补充 UBB 可能出现的简写符号
    CN_TO_PGN_MAP.update({
        "+": "R+",
        "-": "B+",
        "=": "="
    })

    @staticmethod
    def translate_to_cn(text):
        """ PGN符号 -> 中文 """
        if not text: return ""
        res = text
        for k, v in ChessLogic.PGN_TO_CN_MAP.items():
            res = res.replace(k, v)
        return res

    @staticmethod
    def translate_to_symbol(text):
        """ 中文/UBB符号 -> PGN符号 """
        if not text: return ""
        res = text
        # 优先匹配长词，但这不影响 + - 这种单字符
        for k, v in ChessLogic.CN_TO_PGN_MAP.items():
            res = res.replace(k, v)
        return res

    @staticmethod
    def pgn_coord_to_ubb(pgn_move):
        if not pgn_move: return None
        clean = re.sub(r'[^A-I0-9]', '', pgn_move.upper())
        if len(clean) != 4: return None
        try:
            x1 = ChessLogic.cols.index(clean[0])
            y1 = 9 - int(clean[1]) 
            x2 = ChessLogic.cols.index(clean[2])
            y2 = 9 - int(clean[3])
            return f"{x1}{y1}{x2}{y2}"
        except: return None

    @staticmethod
    def ubb_coord_to_pgn(ubb_move):
        if not ubb_move or len(ubb_move) != 4: return "????"
        try:
            x1 = int(ubb_move[0])
            y1 = 9 - int(ubb_move[1]) 
            x2 = int(ubb_move[2])
            y2 = 9 - int(ubb_move[3])
            src = f"{ChessLogic.cols[x1]}{y1}"
            dst = f"{ChessLogic.cols[x2]}{y2}"
            return f"{src}-{dst}"
        except: return "????"

class PgnNode:
    def __init__(self, move_str=None, parent=None):
        self.move_str = move_str 
        self.ubb_code = ChessLogic.pgn_coord_to_ubb(move_str) if move_str else ""
        self.parent = parent
        self.children = [] 
        self.comment = ""

class PgnToUbbWorker:
    def __init__(self, pgn_text):
        self.pgn = pgn_text
        self.tags = {}
        self.root = PgnNode() 
        self.branch_counter = 0 
        self.ubb_tags = [] 
        self.all_comments = {}

    def parse_and_generate(self):
        header_re = re.compile(r'\[(\w+)\s+"([^"]+)"\]')
        for m in header_re.finditer(self.pgn):
            self.tags[m.group(1)] = m.group(2)
        
        body = header_re.sub('', self.pgn).strip()
        body = body.replace("\n", " ").replace("\r", " ")
        while "  " in body: body = body.replace("  ", " ")
        
        self._build_tree(body)
        return self._generate_output()

    def _build_tree(self, text):
        token_re = re.compile(r'(\{[^\}]+\})|(\()|(\))|([A-Ia-i]\d[-\s]?[A-Ia-i]\d)')
        current = self.root
        stack = [] 

        for m in token_re.finditer(text):
            comment, l_paren, r_paren, move = m.groups()
            if move:
                move = move.replace(" ", "").replace("-", "")
                if len(move) == 4: move = f"{move[0:2]}-{move[2:4]}"
                node = PgnNode(move, parent=current)
                current.children.append(node)
                current = node 
            elif l_paren:
                if current.parent: stack.append(current); current = current.parent 
            elif r_paren:
                if stack: current = stack.pop()
            elif comment:
                clean = comment.strip('{}').strip()
                if clean: current.comment = ChessLogic.translate_to_cn(clean)

    def _generate_output(self):
        res_raw = self.tags.get("Result", "*")
        res_chn = "未知"
        if "1-0" in res_raw: res_chn = "红胜"
        elif "0-1" in res_raw: res_chn = "黑胜"
        elif "1/2" in res_raw: res_chn = "和棋"

        out = ["[DhtmlXQ]"]
        out.append("[DhtmlXQ_binit]0919293949596979891777062646668600102030405060708012720323436383[/DhtmlXQ_binit]")
        out.append("[DhtmlXQ_firstnum]0[/DhtmlXQ_firstnum]")
        date_str = self.tags.get('Date', '')
        out.append(f"[DhtmlXQ_adddate]{date_str}[/DhtmlXQ_adddate]")
        out.append(f"[DhtmlXQ_editdate]{date_str}[/DhtmlXQ_editdate]")
        out.append(f"[DhtmlXQ_title]{self.tags.get('Event', '')}[/DhtmlXQ_title]")
        
        main_str = self._traverse_branch(self.root, 0, 0)
        out.append(f"[DhtmlXQ_movelist]{main_str}[/DhtmlXQ_movelist]")
        out.append(f"[DhtmlXQ_length]{len(main_str)//4}[/DhtmlXQ_length]")
        
        for t in ["class", "event", "group", "place", "timerule"]:
            out.append(f"[DhtmlXQ_{t}][/DhtmlXQ_{t}]")
        
        out.append(f"[DhtmlXQ_round]{self.tags.get('Round', '')}[/DhtmlXQ_round]")
        out.append("[DhtmlXQ_table]0[/DhtmlXQ_table]")
        out.append("[DhtmlXQ_date][/DhtmlXQ_date]")
        out.append(f"[DhtmlXQ_result]{res_chn}[/DhtmlXQ_result]")
        out.append(f"[DhtmlXQ_redname]{self.tags.get('Red', '')}[/DhtmlXQ_redname]")
        out.append(f"[DhtmlXQ_blackname]{self.tags.get('Black', '')}[/DhtmlXQ_blackname]")
        
        if self.root.comment:
            out.append(f"[DhtmlXQ_comment0_0]{self.root.comment}[/DhtmlXQ_comment0_0]")
            
        for b_id, ply in sorted(self.all_comments.keys(), key=lambda x: (x[0], x[1])):
            out.append(f"[DhtmlXQ_comment{b_id}_{ply}]{self.all_comments[(b_id, ply)]}[/DhtmlXQ_comment{b_id}_{ply}]")

        for tag in self.ubb_tags: out.append(tag)
        out.append("[DhtmlXQ_generator]PythonFixed[/DhtmlXQ_generator]")
        out.append("[/DhtmlXQ]")
        return "\n".join(out)

    def _traverse_branch(self, parent_node, branch_id, start_ply):
        moves = []
        curr = parent_node
        current_ply = start_ply 
        while curr.children:
            node = curr.children[0]
            current_ply += 1  
            if node.ubb_code:
                moves.append(node.ubb_code)
                if node.comment:
                    self.all_comments[(branch_id, current_ply)] = node.comment
            if len(curr.children) > 1:
                for i in range(1, len(curr.children)):
                    var_node = curr.children[i]
                    self.branch_counter += 1
                    new_id = self.branch_counter
                    fork_ply = current_ply 
                    temp_root = PgnNode()
                    temp_root.children = [var_node]
                    var_str = self._traverse_branch(temp_root, new_id, fork_ply - 1)
                    tag = f"[DhtmlXQ_move_{branch_id}_{fork_ply}_{new_id}]{var_str}[/DhtmlXQ_move_{branch_id}_{fork_ply}_{new_id}]"
                    self.ubb_tags.append(tag)
            curr = node
        return "".join(moves)

# ==========================================
# 逻辑二：UBB -> PGN (修复变招注释丢失)
# ==========================================
class UbbToPgnWorker:
    def __init__(self, ubb_text):
        self.ubb = ubb_text
        self.tags = {}
        self.variations = {} 
        self.comments = {}
        self.main_moves = []

    def run(self):
        matches = re.findall(r'\[DhtmlXQ_([^\]]+)\](.*?)\[/DhtmlXQ_\1\]', self.ubb, re.DOTALL)
        for k, v in matches:
            self.tags[k] = v.strip()
            
        raw_main = re.sub(r'\D', '', self.tags.get('movelist', ''))
        self.main_moves = [raw_main[i:i+4] for i in range(0, len(raw_main), 4)]
        
        # 【修复点1】 解析变招时，必须保留 new_id (第三个分组)
        # 之前代码只存了 content，导致后续递归不知道这是哪个分支，无法匹配注释
        var_matches = re.findall(r'\[DhtmlXQ_move_(\d+)_(\d+)_(\d+)\](.*?)\[/DhtmlXQ_move_[^\]]+\]', self.ubb, re.DOTALL)
        for src, ply, new_id, content in var_matches:
            # key = (父分支ID, 分叉点Ply索引)
            # DhtmlXQ的Ply是1-based，转为0-based需 -1
            key = (int(src), int(ply) - 1)
            
            if key not in self.variations:
                self.variations[key] = []
            
            # 存储格式变更为元组: (新分支ID, 招法内容)
            self.variations[key].append((int(new_id), content.strip()))
            
        # 解析注释 (保持逻辑: Ply - 1)
        comm_matches = re.findall(r'\[DhtmlXQ_comment(\d+)_(\d+)\](.*?)\[/DhtmlXQ_comment\1_\2\]', self.ubb, re.DOTALL)
        for branch, ply, txt in comm_matches:
            if txt.strip():
                trans_txt = ChessLogic.translate_to_symbol(txt.strip())
                ply_idx = int(ply)
                # 0号位是全局注释
                if ply_idx == 0:
                    self.comments[(int(branch), -1)] = trans_txt
                else:
                    self.comments[(int(branch), ply_idx - 1)] = trans_txt
                
        return self._build_pgn()

    def _build_pgn(self):
        res = self.tags.get('result', '*')
        res_map = {"红胜": "1-0", "黑胜": "0-1", "和棋": "1/2-1/2"}
        for k, v in res_map.items():
            if k in res: res = v; break
        
        headers = [
            f'[Event "{self.tags.get("title", "Chinese Chess")}"]',
            f'[Date "{self.tags.get("adddate", "").split(" ")[0]}"]',
            f'[Round "{self.tags.get("round", "?")}"]',
            f'[Red "{self.tags.get("redname", "?")}"]',
            f'[Black "{self.tags.get("blackname", "?")}"]',
            f'[Result "{res}"]',
            ""
        ]
        
        if (0, -1) in self.comments:
            headers.append(f"{{{self.comments[(0,-1)]}}}")
            
        body = self._recursive_print(self.main_moves, branch_id=0, start_ply=0)
        return "\n".join(headers) + body

    def _recursive_print(self, moves_list, branch_id, start_ply):
        if isinstance(moves_list, str):
            clean = re.sub(r'\D', '', moves_list)
            moves = [clean[i:i+4] for i in range(0, len(clean), 4)]
        else:
            moves = moves_list
            
        out = []
        for i, code in enumerate(moves):
            curr_ply = start_ply + i
            move_num = (curr_ply // 2) + 1
            
            if curr_ply % 2 == 0:
                out.append(f"{move_num}. ")
            elif i == 0:
                out.append(f"{move_num}... ")
                
            out.append(ChessLogic.ubb_coord_to_pgn(code))
            
            # 查找注释
            if (branch_id, curr_ply) in self.comments:
                 out.append(f" {{{self.comments[(branch_id, curr_ply)]}}}")

            out.append(" ")
            
            # 【修复点2】 递归处理变招时，使用正确的分支ID
            if (branch_id, curr_ply) in self.variations:
                # 这里的 val 是 (new_id, content_str)
                for new_branch_id, var_str in self.variations[(branch_id, curr_ply)]:
                    out.append("( ")
                    # 关键：传入 new_branch_id 而不是 999
                    out.append(self._recursive_print(var_str, new_branch_id, curr_ply))
                    out.append(") ")
                    
        return "".join(out)
# ==========================================
# Modern GUI (保持不变)
# ==========================================
class ModernApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("象棋棋谱转换器 Pro")
        self.geometry("1100x700")
        ctk.set_appearance_mode("Dark")  
        ctk.set_default_color_theme("blue") 

        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=0)
        self.grid_columnconfigure(2, weight=1)
        self.grid_rowconfigure(0, weight=0)
        self.grid_rowconfigure(1, weight=1)
        self.grid_rowconfigure(2, weight=0)

        self.lbl_title = ctk.CTkLabel(self, text="Xiangqi PGN <-> UBB Converter", font=("Roboto Medium", 20))
        self.lbl_title.grid(row=0, column=0, columnspan=3, pady=(15, 5))

        self.frame_left = ctk.CTkFrame(self)
        self.frame_left.grid(row=1, column=0, sticky="nsew", padx=(20, 5), pady=10)
        self.lbl_pgn = ctk.CTkLabel(self.frame_left, text="PGN (Portable Game Notation)", font=("Roboto", 14, "bold"), text_color="#aaaaaa")
        self.lbl_pgn.pack(pady=5)
        self.txt_pgn = ctk.CTkTextbox(self.frame_left, font=("Consolas", 14), undo=True)
        self.txt_pgn.pack(fill="both", expand=True, padx=5, pady=5)
        
        self.frame_right = ctk.CTkFrame(self)
        self.frame_right.grid(row=1, column=2, sticky="nsew", padx=(5, 20), pady=10)
        self.lbl_ubb = ctk.CTkLabel(self.frame_right, text="UBB (DhtmlXQ Code)", font=("Roboto", 14, "bold"), text_color="#aaaaaa")
        self.lbl_ubb.pack(pady=5)
        self.txt_ubb = ctk.CTkTextbox(self.frame_right, font=("Consolas", 14), undo=True)
        self.txt_ubb.pack(fill="both", expand=True, padx=5, pady=5)

        self.frame_center = ctk.CTkFrame(self, fg_color="transparent")
        self.frame_center.grid(row=1, column=1, padx=5, pady=10)
        self.btn_to_ubb = ctk.CTkButton(self.frame_center, text="PGN  >>>  UBB", font=("Roboto", 12, "bold"), height=40, width=140, command=self.convert_pgn_to_ubb)
        self.btn_to_ubb.pack(pady=20)
        self.btn_to_pgn = ctk.CTkButton(self.frame_center, text="UBB  <<<  PGN", font=("Roboto", 12, "bold"), height=40, width=140, fg_color="#D35B58", hover_color="#C74D4A", command=self.convert_ubb_to_pgn)
        self.btn_to_pgn.pack(pady=20)
        self.btn_clear = ctk.CTkButton(self.frame_center, text="清空所有", font=("Roboto", 12), height=30, width=140, fg_color="transparent", border_width=1, text_color=("#888", "#ccc"), command=self.clear_all)
        self.btn_clear.pack(pady=40)

        self.lbl_status = ctk.CTkLabel(self, text="Ready", anchor="w", text_color="#888")
        self.lbl_status.grid(row=2, column=0, columnspan=3, sticky="ew", padx=20, pady=(0, 10))

    def convert_pgn_to_ubb(self):
        pgn_text = self.txt_pgn.get("0.0", "end").strip()
        if not pgn_text: return
        try:
            worker = PgnToUbbWorker(pgn_text)
            result = worker.parse_and_generate()
            self.txt_ubb.delete("0.0", "end")
            self.txt_ubb.insert("0.0", result)
            self.lbl_status.configure(text="Success: Converted PGN to UBB.", text_color="#4CAF50")
        except Exception as e:
            self.lbl_status.configure(text=f"Error: {str(e)}", text_color="#F44336")
            messagebox.showerror("Parse Error", str(e))

    def convert_ubb_to_pgn(self):
        ubb_text = self.txt_ubb.get("0.0", "end").strip()
        if not ubb_text: return
        try:
            worker = UbbToPgnWorker(ubb_text)
            result = worker.run()
            self.txt_pgn.delete("0.0", "end")
            self.txt_pgn.insert("0.0", result)
            self.lbl_status.configure(text="Success: Converted UBB to PGN.", text_color="#4CAF50")
        except Exception as e:
            self.lbl_status.configure(text=f"Error: {str(e)}", text_color="#F44336")
            messagebox.showerror("Parse Error", str(e))

    def clear_all(self):
        self.txt_pgn.delete("0.0", "end")
        self.txt_ubb.delete("0.0", "end")
        self.lbl_status.configure(text="Ready", text_color="#888")

if __name__ == "__main__":
    app = ModernApp()
    app.mainloop()