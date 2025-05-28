import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
    const provider = new DrawingPadViewProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("drawingPadView", provider),
        vscode.commands.registerCommand('drawing-pad.startCalibration', () => {
            provider.startCalibration();
        })
    );
}

class DrawingPadViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private currentCharIndex = 0;
    private calibrationChars = "abc";
    private calibrationData: {char: string, images: string[]}[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'saveAndOCR':
                    try {
                        const text = await this._performOCR(message.data);
                        this._insertTextToEditor(text);
                        vscode.window.showInformationMessage(`OCR sonucu: ${text}`);
                    } catch (err) {
                        vscode.window.showErrorMessage(`OCR hatası: ${err instanceof Error ? err.message : String(err)}`);
                    }
                    break;
                case 'calibrationData':
                    this._handleCalibrationData(message.char, message.image);
                    break;
                case 'nextCalibrationChar':
                    this._nextCalibrationChar();
                    break;
                case 'startCalibration':
                    this.startCalibration();
                    break;
                case 'editorAction':
                    this._handleEditorAction(message.action);
                    break;
            }
        });
    }

    private _handleEditorAction(action: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Aktif bir editör bulunamadı');
            return;
        }

        const selection = editor.selection;
        const position = selection.active;

        const document = editor.document;
        const totalLines = document.lineCount;

        editor.edit(editBuilder => {
        switch (action) {
            case 'delete':
                if (position.character > 0) {
                    const rangeBefore = new vscode.Range(
                        position.with({ character: position.character - 1 }),
                        position
                    );
                    const charToDelete = document.getText(rangeBefore);
                    
                    editBuilder.delete(rangeBefore);
                } else if (position.line > 0) {
                    const prevLine = document.lineAt(position.line - 1);
                    const newPosition = prevLine.range.end;
                    editor.selection = new vscode.Selection(newPosition, newPosition);
                }
                break;
                
            case 'enter':
                editBuilder.insert(position, '\n');
                const newPosition = position.with({
                    line: position.line + 1,
                    character: 0
                });
                editor.selection = new vscode.Selection(newPosition, newPosition);
                break;
        }
    }).then(success => {
        if (!success) {
            vscode.window.showErrorMessage('Editör değişikliği yapılamadı');
        }
    });

    }

    public startCalibration() {
        this.currentCharIndex = 0;
        this.calibrationData = [];
        this._sendNextCalibrationChar();
    }

    private _sendNextCalibrationChar() {
        if (this.currentCharIndex < this.calibrationChars.length) {
            this._view?.webview.postMessage({
                type: 'startCalibration',
                char: this.calibrationChars[this.currentCharIndex]
            });
        } else {
            this._view?.webview.postMessage({ type: 'calibrationComplete' });
            this.saveCalibrationData();
        }
    }

    private _handleCalibrationData(char: string, image: string) {
        let charData = this.calibrationData.find(item => item.char === char);
        if (!charData) {
            charData = { char, images: [] };
            this.calibrationData.push(charData);
        }
        charData.images.push(image);
        this.currentCharIndex++;
        this._sendNextCalibrationChar();
    }

    private _nextCalibrationChar() {
        this.currentCharIndex++;
        this._sendNextCalibrationChar();
    }

    private async saveCalibrationData() {
        const folderPath = path.join(this._extensionUri.fsPath, 'calibration-data');
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        for (const item of this.calibrationData) {
            const charFolder = path.join(folderPath, item.char);
            if (!fs.existsSync(charFolder)) {
                fs.mkdirSync(charFolder);
            }

            for (let i = 0; i < item.images.length; i++) {
                const imagePath = path.join(charFolder, `${i}.png`);
                fs.writeFileSync(imagePath, Buffer.from(item.images[i], 'base64'));
            }
        }

        await this.trainModel();
    }

    private async trainModel() {
        const scriptPath = path.join(this._extensionUri.fsPath, 'scripts', 'train_model.py');
        const cmd = `python "${scriptPath}" "${this._extensionUri.fsPath}"`;

        return new Promise((resolve, reject) => {
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`Eğitim hatası: ${stderr}`);
                    reject(stderr);
                } else {
                    vscode.window.showInformationMessage('Model başarıyla eğitildi!');
                    resolve(stdout);
                }
            });
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri, 'media', 'main.js'
        ));

        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri, 'media', 'style.css'
        ));

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Drawing Pad</title>
            <link href="${styleUri}" rel="stylesheet">
            <script src="https://code.iconify.design/iconify-icon/3.0.0/iconify-icon.min.js"></script>
        </head>
        <body>
            <div class="container">
                <div id="normalButtons" class="toolbar">
                    <button id="startCalibrationBtn">Kalibrasyon Başlat</button>
                    <button id="clearBtn">Temizle</button>
                    <button id="recognizeBtn">Tanı (E)</button>
                    <button id="deleteButton" title="Sil"><iconify-icon icon="mdi:backspace-outline"></iconify-icon></button>
                    <button id="enterButton" title="Enter"><iconify-icon icon="mdi:keyboard-return"></iconify-icon></button>
                </div>
                <div id="calibrationButtons" class="toolbar" style="display:none">
                    <button id="confirmCalibration">Onayla</button>
                    <button id="skipChar">Karakteri Geç</button>
                </div>
                <div class="notebook"></div>
                <canvas id="draw"></canvas>
                <div id="instructions" class="instructions">
                    Çiziminizi yapın ve "Tanı" butonuna basın veya klavyeden E tuşuna basın
                </div>
            </div>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private async _performOCR(base64: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const tmpDir = os.tmpdir();
            const filePath = path.join(tmpDir, 'drawing_ocr_temp.png');

            fs.writeFile(filePath, Buffer.from(base64, 'base64'), (err) => {
                if (err) {
                    return reject(new Error("Görsel kaydedilemedi: " + err.message));
                }

                const scriptPath = path.join(this._extensionUri.fsPath, 'scripts', 'ocr_reader.py');
                const cmd = `python "${scriptPath}" "${filePath}"`;

                exec(cmd, (err, stdout, stderr) => {
                    fs.unlink(filePath, () => {});
                    if (err) return reject(stderr || err.message);
                    resolve(stdout.trim());
                });
            });
        });
    }

    private _insertTextToEditor(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, text);
            });
        }
    }
}

export function deactivate() {}