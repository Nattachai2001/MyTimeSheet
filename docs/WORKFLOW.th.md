# Workflow การใช้งาน Sup Timesheet Automation

เอกสารสรุป flow การใช้งานแบบย่อ สำหรับทีมและเจ้าของแอป

---

## 1. Workflow ภาพรวม (High-level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        วงจรชีวิต Timesheet 1 เดือน                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   [ทุกวันทำงาน]          [ระหว่างเดือน]           [สิ้นเดือน]            │
│        │                       │                       │                │
│        ▼                       ▼                       ▼                │
│   ตอบ Sup! บน Slack    บันทึกในแอป (Entry)     Review + Generate       │
│        │                       │                       │                │
│        └───────────┬───────────┘                       │                │
│                    ▼                                   │                │
│              JSON ใน Cloud Folder ◄────────────────────┘                │
│                    │                                                    │
│                    ▼                                                    │
│         SkillLane Excel + PDF → ส่งหัวหน้า / HR                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Workflow รายวัน

### เวลา: หลังตอบ Sup! (หรือช่วงเช้าของวันทำงาน)

| ลำดับ | ขั้นตอน | รายละเอียด | ผลลัพธ์ |
|------|---------|-----------|---------|
| 1 | ตอบ Sup! บน Slack | ใส่ Tag `[Meeting]` `[Testing]` `[Develop]` `[Migrate]` | ข้อมูลต้นทาง |
| 2 | เปิดแอป → Entry | Report date = วันที่รายงาน | พร้อมกรอก |
| 3 | กรอก Yesterday / Today | คัดลอกจาก Sup! หรือพิมพ์เอง | ข้อความพร้อม Tag |
| 4 | Save Entry (`Ctrl+S`) | บันทึกลง cloud | ไฟล์ JSON ต่อวัน |
| 5 | (ทางเลือก) ตรวจ Timesheet | ดูปฏิทินเดือนปัจจุบัน | วันนี้ = Saved |

### ทางเลือกแทนการพิมพ์เอง

- รอสะสมแล้ว **Import Sup! Export** ทีเดียวทั้งเดือน (เหมาะสิ้นเดือน)

---

## 3. Workflow สิ้นเดือน (Month-end)

### Trigger

- วันสุดท้ายของเดือน → แอปแจ้งเตือน (ถ้าไม่ submit เกิน 7 วัน)
- หรือผู้ใช้เข้าแท็บ Timesheet เองต้นเดือนถัดไป

### ขั้นตอน 4 Phase

```
Phase A: รวบรวมข้อมูล
─────────────────────
  Import Sup! (ถ้ายังไม่ครบ)
       ↓
  ตรวจปฏิทิน — ทุกวันทำงานต้อง Saved หรือ Leave

Phase B: ปรับแต่ง
─────────────────
  Mark leave (ลาพักร้อน / ลาป่วย)
  ตรวจวันหยุดไทย + extra holidays

Phase C: ตรวจสอบ
─────────────────
  Refresh Preview
  แก้ Pending ที่เหลือ

Phase D: ส่งงาน
───────────────
  Generate Timesheet
  Validate Workbook
  Open Excel + PDF → ส่งตามกระบวนการบริษัท
```

### Definition of Done (สิ้นเดือน)

1. Validation: `completedDays = expectedWorkingDays`
2. ไม่มี missing days ใน panel
3. เปิด Excel/PDF ตรวจสอบด้วยตาแล้ว
4. ส่งไฟล์ตามช่องทางที่ทีมกำหนด

---

## 4. Workflow การตั้งค่า (Onboarding)

### เครื่องแรก

```
ติดตั้งแอป
    → First-run: Use Google Drive (แนะนำ)
    → Settings: Display name, Staff name, Site
    → วาง Template SkillLane รายเดือน
    → Save Settings
    → ทดสอบ Save Entry 1 วัน
```

### เครื่องที่สอง (คนเดิม)

```
ติดตั้งแอป
    → Login Google Drive account เดิม
    → Use Google Drive
    → ตรวจว่า inbox/ มีข้อมูลเดิม
    → ใช้งานต่อได้ทันที
```

---

## 5. Workflow ข้อมูล (Data flow)

```
                    ┌──────────────┐
                    │  Sup! Slack  │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    [พิมพ์ใน Entry]  [Import Export]  [CLI collect]
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                  inbox/YYYY/MM/*.json
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        leave.json   overtime.json   settings.json
              │            │            │
              └────────────┼────────────┘
                           ▼
                    Generate Engine
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
         output/*.xlsx            output/*.pdf
```

### กฎสำคัญของ Detail ต่อวัน

| แหล่งข้อมูล | ใช้สำหรับวันที่ |
|------------|----------------|
| Yesterday ของรายงาน**วันถัดไป** | Detail ของวันทำงานนั้น |
| Today ของรายงาน**วันเดียวกัน** | Fallback ถ้าไม่มีรายงานถัดไป |

→ **ต้องมี Entry ต่อเนื่องทุกวันทำงาน** จึงจะได้ Timesheet ครบ

---

## 6. Workflow บทบาท (RACI ย่อ)

| กิจกรรม | พนักงาน | Admin/เจ้าของแอป |
|---------|---------|-----------------|
| ตอบ Sup! รายวัน | R | I |
| Save/Import Entry | R | I |
| อัปเดต Template รายเดือน | I | R |
| แจก Installer / อบรมทีม | I | R |
| Generate + ส่ง Timesheet | R | I |
| ดูแล Google Drive folder | C | R |

*R = Responsible, I = Informed, C = Consulted*

---

## 7. ปฏิทินแนะนำ (ตัวอย่าง)

| ช่วงเวลา | กิจกรรม |
|----------|---------|
| ทุกวันทำงาน 09:00–12:00 | ตอบ Sup! + Save Entry |
| ทุกศุกร์ | ตรวจปฏิทินสัปดาห์ว่าไม่มี Pending |
| วันสุดท้ายของเดือน | Import Sup! (ถ้าต้องการ) + เริ่ม Review |
| วันที่ 1–3 เดือนใหม่ | Generate + Validate + ส่ง Timesheet เดือนก่อน |

---

## 8. ลิงก์เอกสารที่เกี่ยวข้อง

- คู่มือฉบับเต็ม: [USER_MANUAL.th.md](./USER_MANUAL.th.md)
- README ภาษาอังกฤษ (Technical): [../README.md](../README.md)
