# Installing the Redmine extension in Claude Desktop

[中文](INSTALL.md) | **English**

Once it's installed, you can just tell Claude things like "list the issues assigned to me", "add a note to #1234" or "log 2 hours on #1234".

It takes about 2 minutes, and you don't need to install any other software.

## 0. Make sure Redmine's REST API is enabled

A Redmine administrator needs to tick **Enable REST web service** under **Administration → Settings → API**. Most Redmine instances already have it on; ask your administrator if you're not sure.

## 1. Copy your Redmine API key

Sign in to your Redmine, click **My account** at the top right → **API access key** on the right → **Show**, and copy the string of letters and numbers.

(You can also open `<your Redmine URL>/my/api_key` directly, e.g. `https://redmine.example.com/my/api_key`.)

> This key is your Redmine identity. Don't give it to anyone or paste it into a group chat.

## 2. Download the extension

Download the latest `redmine.mcpb`:

**<https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb>**

(See the [Releases](https://github.com/StockLin/redmine-mcpb/releases) page for what changed in each version.)

## 3. Install

1. Open Claude Desktop.
2. Hand the downloaded `redmine.mcpb` to Claude Desktop:
   - **Mac**: just **double-click** `redmine.mcpb`.
   - **Windows**: **don't double-click** it (Windows asks which app to open it with; just click Cancel). Instead, in Claude Desktop open **Settings** → **Extensions**, then **drag** `redmine.mcpb` from File Explorer into that window.
   - On a Mac, if double-clicking does nothing, the drag-and-drop method works too.
3. Click **Install**.
   - A red warning saying the extension can access your computer is shown for every extension that isn't from Anthropic's directory. This is expected.
4. Click **Configure** and fill in:
   - **Redmine 網址 / URL**: your Redmine URL, e.g. `https://redmine.example.com`
   - **Redmine API 金鑰 / API key**: the key from step 1
5. Click **Save**, then make sure the toggle shows **Enabled**.

## 4. Try it

Start a new chat and type:

> List the Redmine issues assigned to me

If you see your issues, you're done. The first time Claude uses a Redmine tool it asks for permission; choose **Allow**.

## FAQ

**Q: I get 401 or "Unauthorized"**
The key was pasted wrong or has extra spaces. Go to Settings → Extensions → Redmine → Configure and paste it again.

**Q: I get a "redirected" error, or "the Redmine API may be behind a login page"**
Your Redmine has an extra login page in front of it (for example a company SSO) that blocks API requests. Ask your administrator to let the API paths accept the API key directly.

**Q: Claude stopped and asked me to confirm before deleting something**
That's on purpose. Deletions, moving an issue to another project, changing its tracker, project settings, and editing 5 or more issues at once all wait for your confirmation. Check the preview Claude shows, then answer whether to go ahead.

**Q: I want Claude to upload or download attachments**
Go to Settings → Extensions → Redmine → Configure and pick a folder under **Folders for attachments**, for example Downloads. Claude can only touch the folders you pick.

**Q: How do I update to a new version?**
Download `redmine.mcpb` again and install it the same way. Your settings are kept.

**Q: Can Claude do things I'm not allowed to do in Redmine?**
No. It uses your key, so it has exactly the same permissions as you do when you log in to Redmine.
