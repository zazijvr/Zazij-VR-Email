import re

with open('src/components/EmailDetail.jsx', 'r') as f:
    lines = f.readlines()

# The sender info and attachments are roughly between line 777 to 922.
# We will identify the block by searching for the start marker and end marker.

start_sender_info = -1
end_attachments = -1

for i, line in enumerate(lines):
    if '<div className="flex flex-col md:flex-row items-start md:items-center justify-between text-sm gap-3 w-full">' in line and start_sender_info == -1:
        start_sender_info = i
    if '</div>' in line and 'Samotné Iframe Tělo zprávy' in lines[i+2] if i+2 < len(lines) else False:
        end_attachments = i

print(f"Found block: {start_sender_info} to {end_attachments}")

# Extract the block
block_lines = lines[start_sender_info:end_attachments]

# Delete from original
del lines[start_sender_info:end_attachments]

# Now find the Iframe wrapper
iframe_wrapper_start = -1
for i, line in enumerate(lines):
    if '{/* Samotné Iframe Tělo zprávy' in line:
        iframe_wrapper_start = i + 1
        break

if iframe_wrapper_start != -1:
    old_wrapper = lines[iframe_wrapper_start]
    # Make it flex flex-col
    new_wrapper = old_wrapper.replace('flex-1 w-full', 'flex-1 flex flex-col w-full')
    lines[iframe_wrapper_start] = new_wrapper
    
    # insert the block right after the wrapper
    # But wait, we should wrap the sender info block in a shrink-0 container with px-4 py-3 border-b
    
    sender_block = ['          {/* Sender Info Block */}\n',
                    '          <div className="shrink-0 w-full px-4 py-3 md:px-6 md:py-4 border-b border-white/5 bg-[#0a0f1d] z-20">\n'] + \
                   block_lines + \
                   ['          </div>\n']
                   
    # Insert it
    lines = lines[:iframe_wrapper_start+1] + sender_block + lines[iframe_wrapper_start+1:]
    
    # Now find where the iframe starts
    iframe_start = -1
    for i, line in enumerate(lines[iframe_wrapper_start+1:]):
        if '{emailData?.htmlBody ? (' in line:
            iframe_start = iframe_wrapper_start + 1 + i
            break
            
    if iframe_start != -1:
        # Wrap the whole ternary segment in a div
        iframe_wrapper_code = [
            '          <div className="flex-1 relative w-full h-full min-h-0 bg-transparent flex flex-col">\n',
            '            {/* Vizuální buffer (jemný stín) pod hlavičkou pro hladší mizející text při rolování mailu nahoru */}\n',
            '            <div className="absolute top-0 left-0 w-full h-[24px] bg-gradient-to-b from-[#0a0f1d] to-transparent pointer-events-none z-[100] border-t border-black/20"></div>\n'
        ]
        lines = lines[:iframe_start] + iframe_wrapper_code + lines[iframe_start:]
        
        # NOTE: The visual buffer previously existed, so let's carefully remove the old buffer line if it's there
        # We find the old visual buffer and delete it
        old_buffer_idx = -1
        for i, line in enumerate(lines):
            if 'Vizuální buffer (jemný stín)' in line and 'from-[#02050e]' in lines[i+1]:
                old_buffer_idx = i
                break
        if old_buffer_idx != -1:
            del lines[old_buffer_idx:old_buffer_idx+2]
            
        # close the wrapper at the very end of the ternary
        ternary_end = -1
        for i, line in enumerate(lines):
            if 'Zpráva neobsahuje žádný textový, ani HTML obsah ke čtení.' in line:
                ternary_end = i + 2 # the closing tag of the fallback div and the closing brace of the ternary
                break
        if ternary_end != -1:
            lines.insert(ternary_end, '          </div>\n')

with open('src/components/EmailDetail.jsx', 'w') as f:
    f.writelines(lines)

