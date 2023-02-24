import * as vscode from "vscode";
import * as ia from "ia";

const games = {

let selectedGame: typeof games;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vsDos.run', (name: string) => {
      let searchRes = await ia.SearchAPI.get({q:name, fields:["identifier"], page:1});
      let res = `https://archive.org/download/${searchRes["response"]["docs"][0]}/${await MetadataAPI.get({searchRes["response"]["docs"][0], path:"files/0"}).name}`;
      VSDOSPanel.createOrShow(
        context.extensionUri,
        res
      );
    });
  );

  if (vscode.window.registerWebviewPanelSerializer) {
    // Make sure we register a serializer in activation event
    vscode.window.registerWebviewPanelSerializer(VSDOSPanel.viewType, {
      async deserializeWebviewPanel(
        webviewPanel: vscode.WebviewPanel,
        state: any
      ) {
        console.log(`Got state: ${state}`);
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        VSDOSPanel.revive(webviewPanel, context.extensionUri);
      },
    });
  }
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    // Enable javascript in the webview
    enableScripts: true,

    // And restrict the webview to only loading content from our extension's `media` directory.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
  };
}

/**
 * Manages VS-DOS webview panels
 */
class VSDOSPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: VSDOSPanel | undefined;

  public static readonly viewType = "vsDos";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    game: keyof typeof games
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (VSDOSPanel.currentPanel) {
      VSDOSPanel.currentPanel._panel.reveal(column);
      return;
    }

    selectedGame = game;

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      VSDOSPanel.viewType,
      game,
      column || vscode.ViewColumn.One,
      getWebviewOptions(extensionUri)
    );

    VSDOSPanel.currentPanel = new VSDOSPanel(panel, extensionUri);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    VSDOSPanel.currentPanel = new VSDOSPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      (e) => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "alert":
            vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    VSDOSPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._updateVsDos(webview, selectedGame);
    return;
  }

  private _updateVsDos(webview: vscode.Webview, gameName: keyof typeof games) {
    this._panel.title = gameName;
    this._panel.webview.html = this._getHtmlForWebview(
      webview,
      games[gameName]
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview, gamePath: string) {
    console.log("WEBVIEW", webview);
    return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta
				name="viewport"
				content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
				/>
				<style>
				html,
				body,
				#jsdos {
					width: 100%;
					height: 100%;
					padding: 0;
					margin: 0;
					border: none;
					overflow: hidden;
				}
				</style>
			</head>
			
			<body>
				<iframe
				width="100%"
				height="100%"
				frameborder="0"
				src=${gamePath}
				allowfullscreen
				>
				</iframe>
				<script>
				window.onload = () => {
					document.getElementById("jsdos").focus();
			
					window.addEventListener("message", (e) => {
					if (e.data.message === "dz-player-exit") {
						document.getElementById("jsdos").style.display = "none";
						alert("js-dos exited");
					}
					});
				};
				</script>
			</body>
			</html>
					`;
  }
}
