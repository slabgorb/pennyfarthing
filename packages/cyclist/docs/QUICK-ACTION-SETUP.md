# Setting Up Finder Quick Action

Add "Open in Cyclist" to Finder's right-click menu for quick project launching.

## Steps

1. Open **Automator.app** (Cmd+Space, type "Automator")
2. Click **New Document**
3. Select **Quick Action** then click **Choose**
4. Configure workflow settings at the top:
   - "Workflow receives": **folders**
   - "in": **Finder.app**
5. In the left sidebar, search for "Run Shell Script"
6. Drag **Run Shell Script** to the workflow area on the right
7. Configure the shell script action:
   - Shell: `/bin/bash`
   - Pass input: **as arguments**
   - Replace the script with:
   ```bash
   for f in "$@"
   do
     open -a Cyclist --args --project-dir="$f"
   done
   ```
8. Save the workflow (Cmd+S)
   - Name: **Open in Cyclist**
   - Location: defaults to ~/Library/Services/ (correct)
9. Test it:
   - Right-click any folder in Finder
   - Go to **Quick Actions** submenu
   - Click **Open in Cyclist**

## Troubleshooting

### Quick Action doesn't appear

Restart Finder:
- Hold Option key
- Right-click Finder icon in Dock
- Click "Relaunch"

### Permission denied

Make sure Cyclist.app is installed in /Applications:
```bash
cd packages/cyclist
pnpm run install:app
```

### Multiple folders selected

The workflow handles multiple folder selections - it will open one Cyclist instance per folder.

## Alternative: Single Folder Only

If you only want to support single folder selection, use this simpler script:

```bash
open -a Cyclist --args --project-dir="$1"
```

## Removing the Quick Action

Delete the workflow file:
```bash
rm -rf ~/Library/Services/Open\ in\ Cyclist.workflow
```

Then restart Finder.
