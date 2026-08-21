# Brief:
An app for analysing cycle time based on recording of manufacturing processes

Cycle time is measured in seconds

# Basic flow:
1. An app is opened up
2. It allows a user to select a video (file picker)
3. A video is started
4. Each time an enter is pressed a new cycle is recorded

Generated cycle time list should be copied to clipboard in a format that will allow to paste it into excel. Each cycle on a seprate line.

## UI
In a top left corner 
Current cycle time should be displayed in a format like so: Cycle Number - time
A current video time should be displayed (hh:mm:ss)
A name of a video should be displayed

# Additional features
## Speed controls
Bottom row controls the speed of the recording
Z - slowest
X
C
V - normal speed
B
N
M - fastest
X,C,B,N should be middle values

## Skipping
Top row skips n number of seconds
Q - -1 minute
W - -30 seconds
E - -10
R - -5
T - -1

P - 1 minute
O - 30 seconds
I - 10
U - 5
Y - 1

## Pause
Space pause and unpauses the recording

## Copy
Control C should copy cycle times to clipboard as decribed above.

## Rename
G - should allow to rename the video

## Open a new video
H - opens up a new video, everything is reset

## Delete previous cycle time
Backspace should delete the previous cycle time and move the user 5 seconds before the timestamp that was accidently recorded as cycle time.

## App closing
If a user closes the app before a video is finished it should still perform all the function as if a recording was finished.

## Video finished 
After a video is finished do not close the app a user should be able to use all of the normal controls to go back and review the video once more

