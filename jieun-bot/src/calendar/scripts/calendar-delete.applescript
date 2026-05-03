on run argv
	if (count of argv) is not 2 then
		error "Usage: calendarName eventUid"
	end if
	set evCalendar to item 1 of argv
	set evUid to item 2 of argv

	tell application "Calendar"
		tell calendar evCalendar
			set targetEvents to (every event whose uid is evUid)
			if (count of targetEvents) is 0 then
				error "no event with uid " & evUid
			end if
			repeat with ev in targetEvents
				delete ev
			end repeat
		end tell
	end tell
	return "ok"
end run
