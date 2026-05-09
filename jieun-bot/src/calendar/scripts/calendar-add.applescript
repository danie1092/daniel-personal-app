on run argv
	-- argv: title, calendarName, year, month, day, hour, minute, durationMinutes
	-- assumes host TZ = KST; year/month/day/hour/minute are set explicitly so DST/locale ordering doesn't bite.
	if (count of argv) is not 8 then
		error "Usage: title calendar year month day hour minute durationMin"
	end if
	set evTitle to item 1 of argv
	set evCalendar to item 2 of argv
	set theYear to (item 3 of argv) as integer
	set theMonth to (item 4 of argv) as integer
	set theDay to (item 5 of argv) as integer
	set theHour to (item 6 of argv) as integer
	set theMinute to (item 7 of argv) as integer
	set theDuration to (item 8 of argv) as integer

	set startDate to current date
	set year of startDate to theYear
	set month of startDate to theMonth
	set day of startDate to theDay
	set hours of startDate to theHour
	set minutes of startDate to theMinute
	set seconds of startDate to 0

	set endDate to startDate + (theDuration * minutes)

	tell application "Calendar"
		tell calendar evCalendar
			set newEvent to make new event with properties {summary:evTitle, start date:startDate, end date:endDate}
			return uid of newEvent
		end tell
	end tell
end run
