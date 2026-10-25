# Comprehensive SYNOP Validation Guide for IMD Inland Stations

## 1. Purpose and Scope
This document specifies the automated validation rules for surface synoptic observations (SYNOP) reported by Inland Stations of the India Meteorological Department (IMD). Its primary purpose is to outline the exact validation procedures required to detect coding errors, physical inconsistencies, and missing data before the consolidated reports are transmitted to AMSS Chennai. 

The scope is strictly limited to the conventions, code tables, and meteorological rules detailed in the *Weather Code (1982) Reprint 2005* provided by IMD. It focuses exclusively on **inland stations**; coastal/marine groups (Section 2) are excluded.

## 2. Reference Documents and Terminology
*   **Primary Reference:** *Code Book - Surface.pdf* (IMD Weather Code, 1982 version, reprinted 2005).
*   **SYNOP:** Surface Synoptic Observation.
*   **UTC/GMT:** Used interchangeably in the reference document.
*   **Missing Value Indicator:** `/` (solidus).
*   **Omitted Group:** A group entirely left out of the message under specific conditions.

## 3. Inland-Station Reporting Profile
Based on the official IMD guidelines, an inland station reports the following sequence. Groups in brackets `[]` are conditional/optional.

*   **Section 0:** $M_iM_iM_jM_j$ (AAXX) $YYGGi_w$
*   **Section 1:** $IIiii$ $i_R i_x h V V$ $Nddff$ [$1s_nTTT$] [$2s_nT_dT_dT_d$] $3P_0P_0P_0P_0$ [$4PPPP$ or $4a_3hhh$] [$7wwW_1W_2$] [$8N_hC_LC_MC_H$]
*   **Section 2:** *NEVER REPORTED BY INLAND STATIONS.*
*   **Section 3:** `333` [$1s_nT_xT_xT_x$] [$2s_nT_nT_nT_n$] [$56D_LD_MD_H$] [$57CD_ae_c$] [$58P_{24}P_{24}P_{24}$ or $59P_{24}P_{24}P_{24}$] [$6RRRt_R$] [$8N_sCh_sh_s$] [$9S_pS_pS_ps_p$]
*   **Section 5:** `555` [$0R_{24}R_{24}R_{24}R_{24}$] [$1R_TR_TR_TR_T$] [$2D_qF_qqq_t$]

## 4. SYNOP Message Structure and Parsing
The software must parse the message by splitting the text by spaces.
1.  Verify the message begins with `AAXX` (Land station report).
2.  Identify observation day and time from `YYGG`.
3.  Identify the station from the 5-digit index number `IIiii`. *(Note: The codebook page 5 format table omits $IIiii$, but the examples on page 43 explicitly include it. The parser MUST expect a 5-digit station ID after the YYGGiw group).*
4.  Track sections using indicator groups `333` and `555`. 
5.  Each group must contain exactly 5 characters.
6.  The report ends with `=` (Message termination).

## 5. Group-by-Group Coding Reference
*   $i_R$: Inclusion/omission of precipitation (Code 17).
*   $i_w$: Wind indicator (Code 18, 3/4 = knots).
*   $i_x$: Station type and weather inclusion (Code 19).
*   $h$: Cloud base height (Code 14).
*   $VV$: Visibility (Code 25).
*   $N$: Total cloud cover (Code 20).
*   $dd$: Wind direction (Code 8, add 50 if $ff \ge 100$).
*   $ww, W_1, W_2$: Present and past weather (Codes 27 and 26).

## 6. Structural and Syntax Validation Rules

### Rule STR-001: Validate Exact Group Length
1. **Rule ID:** STR-001
2. **Category:** Structural
3. **Element or group:** All groups
4. **Rule name:** Five-Character Group Requirement
5. **Purpose:** Ensures no characters have been dropped or accidentally merged during manual entry.
6. **Applicability:** All stations, all conditions.
7. **Validation logic:** `length(group) == 5` (excluding the `=` terminator if attached).
8. **Expected condition:** Every parsed token must be exactly 5 characters long.
9. **Error condition:** A token is $< 5$ or $> 5$ characters.
10. **Severity:** Critical
11. **Error message:** "Group [X] is malformed. Must be exactly 5 characters."
12. **Suggested action:** Reject; request clarification.
13. **Valid example:** `10103`
14. **Invalid example:** `1010` (Missing character)
15. **Reference:** Section 1, Page 5.
16. **Exceptions:** The section indicators `333` and `555` are 3 characters. The termination symbol `=` is 1 character.

### Rule STR-002: Coastal Section Exclusion
1. **Rule ID:** STR-002
2. **Category:** Structural
3. **Element or group:** Section 2 (`222//`)
4. **Rule name:** No Marine Groups for Inland Stations
5. **Purpose:** Detect accidental inclusion of marine/coastal data by inland observatories.
6. **Applicability:** All inland stations.
7. **Validation logic:** `Message contains '222//'`
8. **Expected condition:** The sequence `222//` is absent.
9. **Error condition:** The sequence `222//` is present.
10. **Severity:** Critical
11. **Error message:** "Section 2 (Marine Data) is strictly forbidden for inland stations."
12. **Suggested action:** Reject report.
13. **Valid example:** `... 8492/ 333 20095 ...`
14. **Invalid example:** `... 8492/ 222// 333 ...` (Marine section included)
15. **Reference:** Explanatory Notes, Page 7, Item 7(A).
16. **Exceptions:** None.

## 7. Code-Table and Numerical Range Validation

### Rule RNG-001: Cloud Amount Indicator Limit
1. **Rule ID:** RNG-001
2. **Category:** Range
3. **Element or group:** N, Nh, Ns
4. **Rule name:** Valid Cloud Amounts
5. **Purpose:** Prevent entry of impossible cloud cover oktas.
6. **Applicability:** All stations.
7. **Validation logic:** `N in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/']`
8. **Expected condition:** Digit is between 0 and 9, or `/`.
9. **Error condition:** Any other character is present.
10. **Severity:** Error
11. **Error message:** "Invalid cloud amount encoded. Must be 0-9 or /."
12. **Suggested action:** Recheck.
13. **Valid example:** `N = 8` (8 oktas/overcast)
14. **Invalid example:** `N = A` (Alphabetic character)
15. **Reference:** Code 20, Page 27.
16. **Exceptions:** None.

## 8. Temperature and Moisture Validation

### Rule TEM-001: Dew Point vs. Dry Bulb
1. **Rule ID:** TEM-001
2. **Category:** Meteorological consistency
3. **Element or group:** $1s_nTTT$ and $2s_nT_dT_dT_d$
4. **Rule name:** Dew Point cannot exceed Dry Bulb
5. **Purpose:** Detect physically impossible temperature/moisture combinations.
6. **Applicability:** All stations reporting both groups.
7. **Validation logic:** `Decode(2snTdTdTd) <= Decode(1snTTT)`
8. **Expected condition:** Dew point is less than or equal to dry-bulb temperature.
9. **Error condition:** Dew point is strictly greater than dry-bulb temperature.
10. **Severity:** Error
11. **Error message:** "Dew point temperature ([Td]) is physically impossible as it exceeds dry-bulb temperature ([T])."
12. **Suggested action:** Reject and request recheck.
13. **Valid example:** `10103 20098` (T=10.3C, Td=9.8C)
14. **Invalid example:** `10103 20115` (T=10.3C, Td=11.5C)
15. **Reference:** Section C standard physical validation, Codebook pg 27 (Code 24).
16. **Exceptions:** If either value is missing (`///`).

## 9. Rainfall and Precipitation Validation

### Rule RAI-001: Precipitation Group Omission Logic
1. **Rule ID:** RAI-001
2. **Category:** Meteorological consistency
3. **Element or group:** $i_R$ and $6RRRt_R$
4. **Rule name:** Correct inclusion/omission of Precipitation Group
5. **Purpose:** Ensure the precipitation group is correctly reported or omitted based on the $i_R$ indicator.
6. **Applicability:** All routine observations.
7. **Validation logic:** 
   `If i_R == '3' or '4', Group 6 must NOT be present.`
   `If i_R == '1' or '2', Group 6 MUST be present.`
8. **Expected condition:** The presence of the 6-group aligns with the $i_R$ indicator.
9. **Error condition:** $i_R=3$ but group 6 is reported, OR $i_R=1$ but group 6 is missing.
10. **Severity:** Critical
11. **Error message:** "Mismatch between iR indicator ([iR]) and presence of precipitation group 6."
12. **Suggested action:** Reject report.
13. **Valid example:** $i_R=3$ and group 6 is omitted. (Page 43, Example II: `iR=4` -> `40028` -> missing group 6).
14. **Invalid example:** $i_R=3$ and `6000/` is reported.
15. **Reference:** Code 17, Page 26 and Explanatory Note 12, Page 8.
16. **Exceptions:** None.

### Rule RAI-002: Precipitation Period ($t_R$) Fixed Value
1. **Rule ID:** RAI-002
2. **Category:** Coding
3. **Element or group:** $6RRRt_R$
4. **Rule name:** Fixed Precipitation Period
5. **Purpose:** Enforce the IMD standard that rainfall is always since 0300 GMT.
6. **Applicability:** When group 6 is reported.
7. **Validation logic:** `t_R == '/'`
8. **Expected condition:** The fifth character of group 6 is `/`.
9. **Error condition:** The fifth character is a digit (0-9).
10. **Severity:** Error
11. **Error message:** "tR must be coded as '/' for Indian stations as precipitation is always since 0300 GMT."
12. **Suggested action:** Override with `/` and generate Warning, or Reject depending on strictness.
13. **Valid example:** `6024/` (2.4 mm rainfall)
14. **Invalid example:** `60241`
15. **Reference:** Explanatory Note 12, Page 8.
16. **Exceptions:** None.

## 10. Pressure Validation

### Rule PRE-001: Pressure Change Tendency
1. **Rule ID:** PRE-001
2. **Category:** Coding
3. **Element or group:** $58P_{24}P_{24}P_{24}$ and $59P_{24}P_{24}P_{24}$
4. **Rule name:** Mutually Exclusive 24-hour Pressure Change
5. **Purpose:** Ensure a station does not report both a rise/no-change AND a fall in 24hr pressure.
6. **Applicability:** Section 3.
7. **Validation logic:** `Count(Group 58) + Count(Group 59) <= 1`
8. **Expected condition:** At most one 58 or 59 group exists.
9. **Error condition:** Both 58 and 59 groups are present.
10. **Severity:** Critical
11. **Error message:** "Report contains both pressure rise (58) and fall (59) groups."
12. **Suggested action:** Reject.
13. **Valid example:** `59034` (Fall of 3.4 mb)
14. **Invalid example:** `58012 59034`
15. **Reference:** Explanatory Notes 11(a) and 11(b), Page 8.
16. **Exceptions:** None.

## 11. Wind Validation

### Rule WND-001: Calm Wind Consistency
1. **Rule ID:** WND-001
2. **Category:** Meteorological consistency
3. **Element or group:** $Nddff$
4. **Rule name:** Calm Wind Zero Rule
5. **Purpose:** Ensure wind direction and speed are both zero during calm conditions.
6. **Applicability:** All stations.
7. **Validation logic:** `(dd == '00' AND ff == '00') OR (dd != '00' AND ff != '00') OR (dd == '99')`
8. **Expected condition:** If direction is 00, speed must be 00. If speed is 00, direction must be 00.
9. **Error condition:** `dd = 00` and `ff > 00`, OR `ff = 00` and `dd > 00` (and `dd != 99`).
10. **Severity:** Error
11. **Error message:** "Inconsistent calm wind report. If dd=00, ff must be 00, and vice versa."
12. **Suggested action:** Reject and request recheck.
13. **Valid example:** `80000` (Overcast, calm wind)
14. **Invalid example:** `80010` (Direction calm, but speed 10 knots)
15. **Reference:** Code 8, Page 18 and Code 12, Page 21.
16. **Exceptions:** `dd=99` (variable wind) is valid with a non-zero `ff`.

## 12. Cloud, Visibility, and Weather Validation

### Rule CLD-001: Cloud Amount Logical Limits
1. **Rule ID:** CLD-001
2. **Category:** Meteorological consistency
3. **Element or group:** $Nddff$ and $8N_hC_LC_MC_H$
4. **Rule name:** Total Cloud Cover vs. Low/Mid Cloud Cover
5. **Purpose:** Ensure the low/mid cloud amount does not mathematically exceed the total sky cloud amount.
6. **Applicability:** When both N and Nh are numerical (0-8).
7. **Validation logic:** `Nh <= N`
8. **Expected condition:** Nh is less than or equal to N.
9. **Error condition:** Nh is strictly greater than N.
10. **Severity:** Error
11. **Error message:** "Low/mid cloud amount (Nh) cannot exceed total cloud amount (N)."
12. **Suggested action:** Reject report.
13. **Valid example:** `N=6, Nh=4`
14. **Invalid example:** `N=3, Nh=5`
15. **Reference:** Code 20 Notes (G), Page 27.
16. **Exceptions:** If N = 9 (sky obscured).

### Rule WX-001: Weather Group Omission Validations
1. **Rule ID:** WX-001
2. **Category:** Coding
3. **Element or group:** $7wwW_1W_2$
4. **Rule name:** Omission of Insignificant Weather
5. **Purpose:** Validate that the 7-group is properly omitted when weather is not significant.
6. **Applicability:** All stations.
7. **Validation logic:** `If ww in [00, 01, 02, 03] AND W1, W2 in [0, 1, 2], Group 7 MUST be omitted AND ix MUST be 2 or 5.`
8. **Expected condition:** Group 7 is absent if weather is insignificant, and $i_x$ is coded to reflect this omission.
9. **Error condition:** Group 7 is reported with insignificant codes (e.g., `70000`), or $i_x=1$ but Group 7 is missing.
10. **Severity:** Error
11. **Error message:** "Group 7 reported with insignificant weather (ww=00-03, W1W2=0-2) OR omitted while ix indicates inclusion."
12. **Suggested action:** Auto-remove Group 7 if insignificant (Informational), or Reject if mismatch with $i_x$.
13. **Valid example:** (Omitted entirely from Section 1, $i_x=2$)
14. **Invalid example:** `70011`
15. **Reference:** Explanatory Note 5, Page 7. Code 19, Page 26.
16. **Exceptions:** None.

### Rule WX-002: Fog and Visibility Consistency
1. **Rule ID:** WX-002
2. **Category:** Meteorological consistency
3. **Element or group:** $VV$ and $ww$
4. **Rule name:** Fog visibility constraints
5. **Purpose:** Fog ($ww=41-49$) requires visibility below 1000m.
6. **Applicability:** When $ww$ is between 41 and 49.
7. **Validation logic:** `Decode(VV) < 1.0 km` (For Extended Code 25, `VV < 10` or `VV >= 90`)
8. **Expected condition:** Visibility is mathematically less than 1km.
9. **Error condition:** Visibility is reported as $\ge$ 1km during fog.
10. **Severity:** Warning
11. **Error message:** "Present weather indicates fog (ww=41-49), but visibility is reported as >= 1km."
12. **Suggested action:** Accept with Warning (human review needed).
13. **Valid example:** `VV = 08` (800m), `ww = 45`
14. **Invalid example:** `VV = 20` (2km), `ww = 45`
15. **Reference:** Code 27, Notes D(b.ii) and F, Page 40/41.
16. **Exceptions:** Shallow fog ($ww=11, 12$) refers to apparent visibility; standard eye-level VV may be $\ge$ 1km.

## 13. Other Applicable Meteorological Groups

### Rule SQU-001: Squall Reporting Groups
1. **Rule ID:** SQU-001
2. **Category:** Inland-Station Rules
3. **Element or group:** $2D_qF_qqq_t$ vs $9S_pS_pS_ps_p$
4. **Rule name:** Departmental vs Non-Departmental Squall Reporting
5. **Purpose:** Ensure squalls are reported using the correct group based on station observer type.
6. **Applicability:** All inland stations.
7. **Validation logic:** Whole-time IMD observatories MUST NOT use group `2DqFqqqt`. They must use `9SpSp...`.
8. **Expected condition:** Full-time stations use group 9 for squalls.
9. **Error condition:** Full-time station reports group 2 in Section 5.
10. **Severity:** Error
11. **Error message:** "Full-time IMD stations must report squalls using the 9SpSpSpSp group, not the 2DqFqqqt group."
12. **Suggested action:** Request clarification.
13. **Valid example:** `99934` (Line squall reported in Section 3)
14. **Invalid example:** `23891` (Used by a whole-time observer)
15. **Reference:** Explanatory Note 17, Page 9.
16. **Exceptions:** Non-whole-time observatories correctly use the `2` group.

## 14. Cross-Group Consistency Checks
*   **WND-CLD Check:** If wind is highly variable and strong ($ff > 25$ knots), cloud base $h$ shouldn't logically be mist/low ground fog unless $ww$ dictates blowing phenomenon (like $ww=30-39$). 
*   **Past Weather Sequence Check:** $W_2$ must always be $\le W_1$. (Codebook page 34: "the code figure for $W_2$ is always equal to or less than the code figure for $W_1$").
*   **Temperature Consistency:** If $T_x$ is reported in 1200 GMT, verify `Decode(Tx) >= Decode(T)`. 

## 15. Temporal and Historical Checks
*   **Tmin Time Check:** The minimum temperature group `2snTnTnTn` in Section 3 MUST ONLY be reported at **0300 GMT** (refers to night minimum since 12 GMT).
*   **Tmax Time Check:** The maximum temperature group `1snTxTxTx` in Section 3 MUST ONLY be reported at **1200 GMT** (refers to day max since 03 GMT).
*   **Rainfall Progressive Total:** `1R_TR_TR_TR_T` is only reported at **0300 GMT**.
*   **Duplicate Station/Time:** The system must reject duplicate messages for the same `IIiii` and `YYGG`.

## 16. Error Severity and Diagnostic Conventions
*   **Critical:** Message is un-parseable, group length is wrong, illegal marine sections included, station ID invalid. *Action: Automatic rejection. Report pushed back to operator.*
*   **Error:** Explicit violation of IMD code tables (e.g., $N=A$, $W_2 > W_1$, Dew Point $>$ Dry Bulb). *Action: Reject with specific highlighted fields for human correction.*
*   **Warning:** Suspicious meteorological states (e.g., Fog with 5km visibility). *Action: Accept into queue but highlight in yellow for manual approval before AMSS dispatch.*
*   **Informational:** Omitted optional groups (e.g., "Group 7 omitted due to insignificant weather"). *Action: Display in parsed GUI, no blockage.*

## 17. Recommended Validation Workflow
1.  **Ingest & Tokenize:** Read raw text, split by whitespace. Verify `AAXX`.
2.  **Metadata Extraction:** Extract `YYGG`, compute observation timestamp. Extract `IIiii`, query station database for elevation (needed for MSL pressure checks).
3.  **Section Mapping:** Group tokens by `333` and `555` indicators. Ensure no `222//` exists.
4.  **Syntax Pass:** Check all tokens for 5-character lengths and valid numeral/solidus characters.
5.  **Decode Data:** Instantiate a `SynopReport` object. Map tokens to physical variables ($T, T_d, P_0, P_{msl}$, etc.).
6.  **Rule Engine (Code Tables):** Validate individual values against Code 1-27 constraints.
7.  **Rule Engine (Physical Consistency):** Run TEM-001, WX-002, PRE-001, etc.
8.  **Diagnostic Generation:** Compile list of generated Error/Warning objects.
9.  **Operator Checklist:** Present UI to Scientific Assistant with parsed values and flagged errors. Do NOT auto-correct.

## 18. Software Architecture and Pseudocode
**Architecture:** 
Implement a pipeline pattern. 
`RawText -> Tokenizer -> SyntaxValidator -> Decoder -> RuleEngine -> DiagnosticReport`

**Pseudocode for Td/T Check:**
```python
def check_temperature_consistency(report):
    if report.dry_bulb is not None and report.dew_point is not None:
        if report.dew_point > report.dry_bulb:
            return ValidationError(
                rule_id="TEM-001",
                severity="Error",
                message=f"Dew point ({report.dew_point}) > Dry bulb ({report.dry_bulb})"
            )
    return None
```

**Pseudocode for Group 6 (Rainfall) Omission:**
```python
def check_rainfall_omission(report):
    has_group_6 = any(g.startswith('6') for g in report.section_3)
    if report.iR in ['3', '4'] and has_group_6:
        return ValidationError("RAI-001", "Critical", "iR=3/4 but Group 6 is present.")
    if report.iR in ['1', '2'] and not has_group_6:
        return ValidationError("RAI-001", "Critical", "iR=1/2 but Group 6 is missing.")
```

## 19. Machine-Readable Rule Catalogue Example (JSON)
```json
{
  "rules": [
    {
      "rule_id": "TEM-001",
      "category": "Meteorological consistency",
      "name": "Dew point vs Dry bulb",
      "severity": "Error",
      "logic": "T_d <= T",
      "error_message": "Dew point physically cannot exceed dry bulb temperature.",
      "action": "Reject"
    },
    {
      "rule_id": "WND-001",
      "category": "Meteorological consistency",
      "name": "Calm wind check",
      "severity": "Error",
      "logic": "if dd == 00 then ff == 00",
      "error_message": "Calm wind (dd=00) must have zero speed (ff=00)."
    }
  ]
}
```

## 20. Worked Examples and Test Cases
*Based strictly on Codebook Page 43, Example I & II.*

**Test Case 1: Valid 0300 GMT Report (Example I)**
*   **Encoded:** `AAXX 16034 21596 82709 10103 20098 40028 76196 8492/ 333 20095 56699 57972 59034 6024/ 83620 81925 88458 555 00243 10037 27828 =`
*   **Decoding Check:** 
    *   `16034`: 16th day, 0300 GMT, $i_w=4$ (knots).
    *   `10103`: $s_n=0$ (+), T = 10.3°C.
    *   `20098`: $s_n=0$ (+), Td = 9.8°C. Rule TEM-001 Passes (9.8 <= 10.3).
    *   `40028`: MSL Pressure = 1002.8 mb.
    *   `333 20095`: Section 3, Min Temp ($T_n$) = 9.5°C. Valid for 03 GMT observation.
    *   `6024/`: 2.4mm rain, $t_R=/$. Rule RAI-002 Passes.
*   **Result:** Accept. No errors triggered.

**Test Case 2: Missing Rain Logic (Example II)**
*   **Encoded:** `AAXX 10124 32997 00503 333 10403 58008 10377 20202 =` (From Page 43, Note $IIiii$ missing in the printed example text but `32997` acts as station ID, Wait, the example says `49932` was dropped in my transcript? Let's treat `49932` as `4PPPP`.)
    Let's inject an error: `iR` encoded as `3` (Omit rain), but Section 3 includes `6000/`.
*   **Error triggered:** Rule RAI-001. "Mismatch between iR indicator (3) and presence of precipitation group 6."
*   **Result:** Reject. 

## 21. Unit Testing and Regression Testing
*   **Test Suite Requirements:** Create isolated tests for each code table validation.
*   **Boundary Testing:** Test `T = 00.0`, `Td = -00.6` (group `21006`).
*   **Regression Sets:** Use historically archived errors from IMD operators to ensure the software flags known common mistakes (e.g., $W_2$ entered greater than $W_1$).

## 22. Known Limitations and Unresolved Questions
*   **Station ID ($IIiii$) Omission in Spec:** The structural table on Page 5 omits the 5-digit station ID block between $YYGGi_w$ and $i_R i_x h V V$, but standard WMO formatting and the examples on Page 43/44 clearly include it. The parser *must* be programmed to expect $IIiii$.
*   **Pressure Group rules (4PPPP vs $4a_3hhh$):** Explanatory Note 3 (Page 6) and 4 (Page 7) have slight contradictory overlap regarding stations between 500m and 800m. The guide assumes `4PPPP` is mandated for $< 800m$ as per Note 4, but local configurations must be consulted.
*   **Abridged vs Extended Visibility:** Code 25 contains two tables. Stations with instruments use 00-89; without use 90-99. The validation software will require Station Metadata to know which scale a specific station is authorized to use.

## 23. Implementation Checklist
- [ ] Parser module capable of isolating sections (0/1, 3, 5).
- [ ] Dictionary map for IMD Code Tables 1 through 27.
- [ ] Station Metadata Database (Elevation, Observer Type, Instrument profile).
- [ ] Physical consistency logic engine.
- [ ] User Interface for Scientific Assistant review.
- [ ] Audit log generation for altered/accepted reports.

## 24. Quick-Reference Tables for Common SYNOP Errors
| Parameter | Common Mistake | Software Action |
| :--- | :--- | :--- |
| **Temperatures** | Dew Point > Dry Bulb | Block & flag for correction |
| **Past Wx** | $W_2$ encoded $> W_1$ | Block & flag (W2 must be $\le$ W1) |
| **Precipitation** | $i_R=3$ but Group 6 present | Block & flag (RAI-001) |
| **Precip Time** | $t_R$ coded as digit (e.g., `1`) | Warning: force to `/` |
| **Section 2** | `222//` included in inland report | Block & flag (Coastal only) |
| **Squalls** | Full-time station using `2DqFq...` | Block & request `9SpSpSpSp` |
