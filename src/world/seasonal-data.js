// Typical seasonal windows, not fixtures. Local story calendars always take priority.
// Calendar references: registrar.utexas.edu/calendars/26-27; ox.ac.uk/about/the-university/facts-and-figures/dates-of-term;
// operations.nfl.com/calendar-events/nfl-important-dates; ncaa.com (annual football schedule).
// Hogwarts: Philosopher's Stone chs. 6–7, 10–11, 12, 16–17; Prisoner of Azkaban chs. 15–16;
// Order of the Phoenix ch. 31. Recurring school anchors only, not a fan-derived exact match timetable.
export const MONTHLY_SEASONS = {
    "us_university": [
        "Winter break, then spring-semester move-in and opening classes; local January terms vary.",
        "Spring-semester classes, assignments and early assessments.",
        "Midterm assessments and possible spring break; follow the school's actual dates.",
        "Spring coursework, projects and preparation for final assessments.",
        "Finals, commencement and move-out, followed by summer break or summer courses.",
        "Summer break, internships or summer session.",
        "Summer courses, internships and preparation for the next academic year.",
        "Early month: summer sessions and preparations. Later month: housing move-in, orientation and autumn-semester opening where scheduled.",
        "Autumn-semester opening routines, clubs, classes and assignments.",
        "Autumn classes and midterm assessments; homecoming only on the institution's schedule.",
        "Autumn coursework, possible Thanksgiving break and approaching finals.",
        "Early month: final projects and exams. Later month: move-out and winter break."
    ],
    "uk_university": [
        "Return from Christmas break; assessments or the winter/spring term according to the institution.",
        "Winter/spring-term teaching, coursework and institution-specific reading weeks.",
        "Teaching and assessments toward the spring/Easter break; dates vary.",
        "Easter vacation or return to teaching/revision, according to the local term calendar.",
        "Assessment, revision and examinations; teaching may continue under the institution's timetable.",
        "Examinations, end-of-term work and the start of summer vacation, depending on the course.",
        "Summer vacation, placements and possible graduation ceremonies on the institution's schedule.",
        "Summer vacation, resits where scheduled and preparations for the next academic year.",
        "Accommodation move-in, welcome/freshers activities and term opening at many institutions; some start in October.",
        "Autumn-term opening or established teaching, coursework and society activities.",
        "Autumn teaching, coursework and assessments; reading weeks vary.",
        "End-of-term work and Christmas vacation, with dates set by the institution."
    ],
    "college_football": [
        "Remaining bowls/CFP rounds for qualifying teams; otherwise season review, recovery and winter conditioning. Eligible players may consider NFL entry and evaluation preparation.",
        "Winter conditioning and roster preparation; draft prospects may prepare for an invited Combine appearance.",
        "Spring practices where scheduled. Eligible NFL prospects may have Combine evaluation, pro days or team meetings; invitations are not guaranteed.",
        "Spring practices and spring games where scheduled. Eligible prospects may face the NFL Draft or undrafted-free-agent opportunities; do not assume selection or a contract.",
        "Recovery and strength work; summer preparation. Newly signed professionals may attend rookie activities; signing is not a playing debut.",
        "Summer conditioning and permitted team preparation, alongside recruiting activities where relevant.",
        "Summer preparation, media events and approaching preseason camp.",
        "Early/mid month: preseason camp, installation and position competition. Late month: final preparations or scheduled Week Zero/opening games.",
        "Opening and early regular-season games; conference and nonconference timing follows the team's schedule.",
        "Regular-season conference play, weekly preparation and rivalry/homecoming occasions only when locally scheduled.",
        "Late regular season, rivalries and qualification stakes. Eligibility, draft decisions and postseason access depend on the player and team.",
        "Conference championships, bowls and CFP opening rounds where applicable; others enter recovery/conditioning. Eligible players may consider draft entry."
    ],
    "pro_football": [
        "Early month: final regular-season games. Then playoff rounds for qualifiers; eliminated teams begin recovery and roster review.",
        "Early month: championship/Super Bowl preparation for remaining teams. Otherwise offseason recovery; late month may bring Combine evaluations for invited prospects.",
        "Free-agency and roster work; prospect evaluation, pro days and team visits where scheduled.",
        "Offseason workout programs and NFL Draft preparation/event, following the league and team's actual calendar.",
        "Rookie minicamps, onboarding, offseason workouts and possible OTAs; a contract or camp place does not establish a game debut.",
        "OTAs and mandatory minicamps on team schedules, then a break before camp.",
        "Summer break followed by training-camp reporting, installation and position competition on team dates.",
        "Training camp, preseason games, roster decisions and final regular-season preparation.",
        "Opening and early regular season; game preparation, recovery and possible debuts only if the roster and fixture support them.",
        "Regular-season preparation, games and bye weeks according to each team's schedule.",
        "Regular season, roster/deadline pressures and developing playoff stakes; do not infer a fixture or qualification.",
        "Late regular season and possible playoff qualification/elimination stakes; each team's actual situation governs."
    ],
    "hogwarts": [
        "Return after Christmas; lessons, homework and house Quidditch when scheduled.",
        "Lessons and homework; house Quidditch when scheduled. Valentine's activities are not an automatic school-wide event.",
        "Lessons, assignments and revision; Easter holiday timing varies. Eligible older students may have Apparition instruction if established.",
        "Easter holidays or return to lessons and revision, depending on dates; scheduled Quidditch may continue.",
        "Exam preparation and late-year school activities; remaining house Quidditch fixtures follow the established schedule.",
        "Annual exams; OWLs for fifth-years and NEWTs for seventh-years. End-of-year feast, House Cup and departure for summer, subject to the year's established events.",
        "Summer holiday and homework; exam results and next-year preparations when supported. No routine Hogwarts lessons.",
        "Summer holiday, school supplies and preparation for returning students; no invented annual tournament.",
        "1 September: Hogwarts Express leaves King's Cross at 11 a.m.; arrival, Sorting and start-of-term feast. Lessons and Quidditch team preparations follow.",
        "Autumn lessons and training; 31 October Halloween feast at Hogwarts.",
        "Autumn lessons and the usual opening period of house Quidditch fixtures; exact matches are not fixed by the month.",
        "Lessons before Christmas break, decisions about staying at school, Christmas decorations and 25 December feast for those present."
    ]
};

export function monthlySeason(key, date) {
    const list = MONTHLY_SEASONS[key];
    if (!list || !date?.month) return '';
    let value = list[date.month - 1];
    // Refine meaningful transitions without pretending to know an institution/team schedule.
    if (date.day) {
        const split = {
            'us_university:8': [15, 'Summer sessions and preparation for move-in.', 'Move-in, orientation and autumn-semester opening where scheduled.'],
            'us_university:12': [18, 'Final projects, final exams and the approach of winter break.', 'Winter break and move-out where scheduled.'],
            'college_football:8': [22, 'Preseason camp, installation and position competition.', 'Final camp preparations or scheduled Week Zero/opening games.'],
            'pro_football:1': [8, 'Final regular-season games or the transition to playoffs, according to the league calendar.', 'Playoff rounds for qualifiers; eliminated teams begin offseason recovery.'],
            'pro_football:2': [15, 'Championship/Super Bowl period for remaining teams; offseason for others.', 'Offseason recovery and approaching Combine evaluations for invited prospects.'],
        }[key + ':' + date.month];
        if (split) value = split[date.day <= split[0] ? 1 : 2];
    }
    return value;
}

