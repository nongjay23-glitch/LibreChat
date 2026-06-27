import { CheckCircle2, FileText, Lock, MessagesSquare, ShieldCheck } from 'lucide-react';

const workflowItems = [
  {
    title: 'Draft with AI',
    description: 'ใช้แชทหลักเพื่อเขียน เปรียบเทียบ และปรับงาน โดยยังไม่แตะไฟล์ในเครื่องโดยตรง',
    icon: FileText,
  },
  {
    title: 'Project context',
    description: 'จัดแชทเป็นกลุ่มใน Projects ได้ ส่วนระบบค้นเอกสารแบบ NotebookLM จะทำภายหลัง',
    icon: MessagesSquare,
  },
  {
    title: 'Human confirmation',
    description: 'การแก้ไฟล์ในอนาคตต้องแสดง diff ให้เห็นก่อน และต้องให้ผู้ใช้ยืนยันชัดเจน',
    icon: CheckCircle2,
  },
];

export default function CoworkPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
      <div>
        <div className="mb-2 flex items-center gap-2 text-text-primary">
          <ShieldCheck className="h-5 w-5 text-green-500" aria-hidden="true" />
          <h2 className="text-base font-semibold">Cowork</h2>
        </div>
        <p className="text-sm leading-5 text-text-secondary">
          โหมดนี้เป็นพื้นที่วางแผนและทำงานร่วมกับ AI เท่านั้น ใช้สำหรับคิดงาน สรุปทางเลือก และเตรียม context
          ก่อนส่งเข้าแชทหลัก
        </p>
      </div>

      <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
          <div>
            <div className="font-medium text-text-primary">File access locked</div>
            <div className="mt-1 text-xs leading-5 text-text-secondary">
              หน้านี้ยังไม่มีเครื่องมือฝั่ง backend สำหรับจัดการไฟล์ ถ้าจะเปิดในอนาคตจะจำกัดเฉพาะ workspace
              ที่อนุญาตเท่านั้น
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {workflowItems.map((item) => (
          <div key={item.title} className="rounded-lg border border-border-light p-3">
            <div className="flex items-start gap-3">
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <div>
                <div className="font-medium text-text-primary">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-text-secondary">{item.description}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
