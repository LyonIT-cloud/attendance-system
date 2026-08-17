import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, setDoc, doc, getDoc, query, orderBy, where, deleteDoc, serverTimestamp, limit, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAzRmuyxGJSip4k2VANAuUtuJLf25Ft9Pc",
    authDomain: "company-attendance-syste-e3503.firebaseapp.com",
    projectId: "company-attendance-syste-e3503",
    storageBucket: "company-attendance-syste-e3503.firebasestorage.app",
    messagingSenderId: "1092562606409",
    appId: "1:1092562606409:web:24843bace8a4e1e2616298",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const managerEmails = {
    "管理部": "it@tw.topdgi.com,lon.lin@tw.topdgi.com",
    "製造部": "mark.lu@tw.topdgi.com",
    "工程部": "tommy.yao@tw.topdgi.com",
    "SMT": "nick.ho@tw.topdgi.com",
    "DIP": "mark.lu@tw.topdgi.com,jackson.chan@tw.topdgi.com",
    "資材部": "mia.hou@tw.topdgi.com",
    "業務部": "wayne.lee@tw.topdgi.com",
    "品保部": "it@tw.topdgi.com"
};

const gmTargetIds = ["D220013", "D220002", "D220067", "D220282", "D220134"];
const gmEmail = "wayne.lee@tw.topdgi.com";

function sendEmailNotification(data) {
    let recipients = managerEmails[data.dept] || "it@tw.topdgi.com";
    if (gmTargetIds.includes(data.id.toUpperCase())) { recipients = gmEmail; }
    const subject = encodeURIComponent(`【請假通知】${data.dept}-${data.name} (${data.leaveType})`);
    const body = encodeURIComponent(
        `🔔 新請假申請通知\n` +
        `--------------------------\n` +
        `【部門】：${data.dept}\n` +
        `【姓名】：${data.name}\n` +
        `【工號】：${data.id}\n` +
        `【假別】：${data.leaveType}\n` +
        `【日期】：${data.sDate === data.eDate ? data.sDate : data.sDate + ' ~ ' + data.eDate}\n` +
        `【時數】：${data.displayDuration}\n` +
        `【事由】：${data.reason || "無"}\n` +
        `--------------------------\n` +
        `請登入系統核准。`
    );
    window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
}

let allRecords = []; 
let personalRecords = []; 
let filteredRecords = []; 
let allEmployeesCache = null;
let currentPage = 1;
const rowsPerPage = 10;
let adminCurrentPage = 1;
let currentAdminDept = "";
let currentPendingDocs = []; 
let isApprovalListAuth = false; 

const adminPasswords = {
    "mgt888": "管理部", "mfg888": "製造部", "eng888": "工程部", "smt888": "SMT",
    "qa888": "品保部", "log888": "資材部", "sales888": "業務部", "dip888": "DIP",
    "hr888": "ALL", "GM888": "總經理"
};

const leaveTypeTranslations = {
    '事假': 'Nghỉ việc riêng', '病假': 'Nghỉ ốm', '特休': 'Nghỉ phép năm', '公假': 'Nghỉ công tác',
    '產假': 'Nghỉ thai sản', '陪產假': 'Nghỉ chế độ thai sản (nam)', '補休': 'Nghỉ bù', '婚假': 'Nghỉ kết hôn',
    '生理假': 'Nghỉ kinh nguyệt', '工傷假': 'Nghỉ tai nạn lao動', '家庭照顧假': 'Nghỉ chăm sóc gia đình'
};

const reverseLeaveTranslations = Object.fromEntries(
    Object.entries(leaveTypeTranslations).map(([zh, vi]) => [vi, zh])
);

window.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (document.getElementById('filterMonth')) document.getElementById('filterMonth').value = yearMonth;
    if (document.getElementById('exportMonth')) document.getElementById('exportMonth').value = yearMonth;
});

async function loadEmployeesData() {
    if (allEmployeesCache !== null) return;
    try {
        const snap = await getDocs(collection(db, "employees"));
        allEmployeesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("載入員工清單失敗", e);
        allEmployeesCache = [];
    }
}

window.openMemberListModal = async () => {
    document.getElementById('memberListModal').style.display = 'flex';
    document.getElementById('modalMemberTableBody').innerHTML = '<tr><td colspan="3" style="text-align:center;">讀取中...</td></tr>';
    document.getElementById('memberCountInfo').innerText = '載入中統計...';
    
    allEmployeesCache = null; 
    await loadEmployeesData();
    
    document.getElementById('modalDeptFilter').value = "";
    renderModalMembers(allEmployeesCache);
};

window.closeMemberListModal = () => {
    document.getElementById('memberListModal').style.display = 'none';
};

window.filterModalMembers = () => {
    if (!allEmployeesCache) return;
    const selectedDept = document.getElementById('modalDeptFilter').value;
    const filtered = selectedDept ? allEmployeesCache.filter(e => e.dept === selectedDept) : allEmployeesCache;
    renderModalMembers(filtered);
};

function renderModalMembers(list) {
    const tbody = document.getElementById('modalMemberTableBody');
    const infoBar = document.getElementById('memberCountInfo');
    const selectedDept = document.getElementById('modalDeptFilter').value;
    
    const totalCount = allEmployeesCache ? allEmployeesCache.length : 0;
    if (selectedDept) {
        infoBar.innerHTML = `📊 【${selectedDept}】目前最新人數：<span style="color:#ffffff; font-size:16px;">${list.length}</span> 人 (全公司總人數：${totalCount} 人)`;
    } else {
        infoBar.innerHTML = `📊 全公司總人數：<span style="color:#ffffff; font-size:16px;">${totalCount}</span> 人`;
    }

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">查無成員資料</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(emp => `
        <tr>
            <td>${emp.dept || '-'}</td>
            <td><b>${emp.id || '-'}</b></td>
            <td>${emp.name || '-'}</td>
        </tr>
    `).join('');
}

window.uploadEmployeeExcel = async () => {
    const fileInput = document.getElementById('employeeExcelFile');
    if (!fileInput.files || fileInput.files.length === 0) {
        return alert("請先選擇要上傳的員工 Excel 檔案！");
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (!jsonData || jsonData.length === 0) {
                return alert("❌ 錯誤：Excel 檔案內容為空或格式無法辨識！");
            }

            let successCount = 0;
            let batch = writeBatch(db);
            let batchCounter = 0;

            for (let row of jsonData) {
                const dept = String(row['部門'] || row['dept'] || row['Dept'] || '').trim();
                const empId = String(row['工號'] || row['id'] || row['EmpId'] || row['ID'] || '').trim().toUpperCase();
                const name = String(row['姓名'] || row['name'] || row['Name'] || '').trim();

                if (empId && name) {
                    const empRef = doc(db, "employees", empId);
                    batch.set(empRef, { dept: dept, name: name, updatedAt: serverTimestamp() }, { merge: true });
                    successCount++;
                    batchCounter++;

                    if (batchCounter >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCounter = 0;
                    }
                }
            }

            if (batchCounter > 0) {
                await batch.commit();
            }

            allEmployeesCache = null; 
            alert(`🎉 成功同步！已完成 ${successCount} 筆員工資料的匯入／更新。`);
            fileInput.value = "";
        } catch (err) {
            alert("❌ 解析或上傳 Excel 發生異常：" + err.message);
        }
    };

    reader.readAsArrayBuffer(file);
};

window.changeLanguage = (lang) => {
    const elements = document.querySelectorAll('[data-vi]');
    elements.forEach(el => {
        if (el.closest('#page-admin') && el.id !== 'adminTitle') return;
        if (el.closest('#page-data-admin')) return;
        if (lang === 'vi') {
            if (!el.dataset.zh) el.dataset.zh = el.innerText; 
            el.innerText = el.dataset.vi;
        } else {
            if (el.dataset.zh) el.innerText = el.dataset.zh;
        }
    });
    const leaveSelect = document.getElementById('leaveType');
    if (leaveSelect) {
        Array.from(leaveSelect.options).forEach(opt => {
            const zhValue = opt.value; 
            if (lang === 'vi') { opt.text = leaveTypeTranslations[zhValue] || zhValue; }
            else { opt.text = zhValue; }
        });
    }
};

window.checkDataAdminAccess = () => {
    const passwordInput = prompt("請輸入管理員核心權限密碼:");
    if (passwordInput === "admin") {
        window.switchPage('data-admin');
    } else if (passwordInput !== null) {
        alert("驗證失敗！密碼不正確，存取遭拒。");
    }
};

window.performMonthlyDelete = async () => {
    const selectedMonth = document.getElementById('deleteMonthInput').value;
    if (!selectedMonth) return alert("操作終止：請先指定要處理的月份區間！");
    
    const doubleCheck = confirm(`⚠️ 這是無法回復的操作！\n您確定要把 ${selectedMonth} 月份的所有歷史請假紀錄從資料庫連根拔除嗎？`);
    if (!doubleCheck) return;

    try {
        const startStr = `${selectedMonth}-01`;
        const [y, m] = selectedMonth.split('-').map(Number);
        const nextMonthObj = new Date(y, m, 1);
        const endStr = `${nextMonthObj.getFullYear()}-${String(nextMonthObj.getMonth() + 1).padStart(2, '0')}-01`;

        const queryObj = query(
            collection(db, "formEntries"),
            where("sDate", ">=", startStr),
            where("sDate", "<", endStr)
        );
        
        const snapshot = await getDocs(queryObj);

        if (snapshot.size === 0) {
            alert(`通知：資料庫內查無 ${selectedMonth} 月份的請假申請紀錄。`);
            return;
        }

        const snapshotDocs = snapshot.docs;
        const singleBatchLimit = 400; 
        let totalDeleted = 0;

        for (let chunkIdx = 0; chunkIdx < snapshotDocs.length; chunkIdx += singleBatchLimit) {
            const batchWorker = writeBatch(db);
            const targetedChunk = snapshotDocs.slice(chunkIdx, chunkIdx + singleBatchLimit);
            
            targetedChunk.forEach(dDoc => {
                batchWorker.delete(dDoc.ref);
            });
            
            await batchWorker.commit();
            totalDeleted += targetedChunk.length;
        }

        alert(`清除完畢！已成功自雲端移除 ${selectedMonth} 月份共計 ${totalDeleted} 筆請假文件資料。`);
        
        if (isApprovalListAuth) window.loadAllRecords();
    } catch (err) {
        alert("批次資料抹除程序發生異常：" + err.message);
    }
};

function formatDuration(minutes) {
    if (isNaN(minutes)) return "0 時 0 分";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} 時 ${m} 分`;
}

function safeGet(obj, keys, defaultVal = "") {
    for (let key of keys) { if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key]; }
    return defaultVal;
}

window.changePage = (step) => {
    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
    const newPage = currentPage + step;
    if (newPage >= 1 && newPage <= totalPages) { currentPage = newPage; window.renderTable(); }
};

window.changeAdminPage = (step) => {
    const totalPages = Math.ceil(currentPendingDocs.length / rowsPerPage) || 1;
    const newPage = adminCurrentPage + step;
    if (newPage >= 1 && newPage <= totalPages) { adminCurrentPage = newPage; window.renderAdminTable(); }
};

let fetchNameTimeout = null;

window.autoFetchName = async () => {
    const rawEmpId = document.getElementById('empId').value.trim();
    const nameInput = document.getElementById('empName');
    const deptInput = document.getElementById('dept');
    
    if (rawEmpId.length < 4) { 
        nameInput.value = ""; 
        deptInput.value = "";
        deptInput.disabled = false;
        return; 
    }
    
    if (fetchNameTimeout) clearTimeout(fetchNameTimeout);
    
    nameInput.value = "輸入中...";
    
    fetchNameTimeout = setTimeout(async () => {
        try {
            nameInput.value = "查詢中...";
            
            let docRef = doc(db, "employees", rawEmpId);
            let docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                docRef = doc(db, "employees", rawEmpId.toUpperCase());
                docSnap = await getDoc(docRef);
            }
            
            if (!docSnap.exists()) {
                docRef = doc(db, "employees", rawEmpId.toLowerCase());
                docSnap = await getDoc(docRef);
            }
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                nameInput.value = data.name || "";
                if(data.dept) {
                    deptInput.value = data.dept; 
                    deptInput.disabled = true; 
                }
            } else { 
                nameInput.value = "查無此人"; 
                deptInput.value = "";
                deptInput.disabled = false;
            }
        } catch (error) { 
            nameInput.value = "系統錯誤"; 
            deptInput.disabled = false;
        }
    }, 250);
};

window.loadAllRecords = async () => {
    if (!isApprovalListAuth) {
        const pw = prompt("請輸入核准清單查看密碼:");
        if (pw !== "top") { alert("密碼錯誤，無法載入資料！"); return; }
        isApprovalListAuth = true;
    }
    try {
        const q = query(collection(db, "formEntries"), orderBy("updatedAt", "desc"), limit(100));
        const snap = await getDocs(q);
        const recordsMap = new Map();
        snap.docs.forEach(d => recordsMap.set(d.id, { docId: d.id, ...d.data() }));

        const pendingQuery = query(collection(db, "formEntries"), where("status", "==", "審核中"));
        const pendingSnap = await getDocs(pendingQuery);
        pendingSnap.docs.forEach(d => {
            if (!recordsMap.has(d.id)) {
                recordsMap.set(d.id, { docId: d.id, ...d.data() });
            }
        });

        allRecords = Array.from(recordsMap.values());
        checkOverduePendingRecords();
        window.applyFilters();
    } catch (e) { 
        if (e.message.includes("quota") || e.code === "resource-exhausted") {
            document.getElementById('maintenance-overlay').style.display = 'flex';
        }
    }
};

function checkOverduePendingRecords() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    const overdueList = allRecords.filter(r => {
        if (r.status !== "審核中") return false;
        
        let timeObj = null;
        const rawTime = r.updatedAt || r.createdAt;
        
        if (rawTime?.toDate) {
            timeObj = rawTime.toDate();
        } else if (typeof rawTime === 'number') {
            timeObj = new Date(rawTime);
        } else if (typeof rawTime === 'string') {
            timeObj = new Date(rawTime);
        } else if (r.sDate) {
            timeObj = new Date(r.sDate);
        }

        if (!timeObj || isNaN(timeObj.getTime())) return false;
        return timeObj < sevenDaysAgo;
    });

    const warningCard = document.getElementById('overdueWarningCard');
    const badge = document.getElementById('overdueCountBadge');
    const tbody = document.getElementById('overdueTableBody');

    if (overdueList.length > 0) {
        warningCard.style.display = 'block';
        badge.innerText = `${overdueList.length} 筆`;
        tbody.innerHTML = overdueList.map(r => `
            <tr>
                <td>${r.dept || '-'}</td>
                <td><b>${r.id || '-'}</b></td>
                <td>${r.name || '-'}</td>
                <td>${r.leaveType || '-'}</td>
                <td>${safeGet(r, ['sDate', 'startDate'])}</td>
                <td>${r.displayDuration || formatDuration(r.duration)}</td>
                <td><button class="btn btn-primary" style="padding:4px 10px; min-height:auto; font-size:12px;" onclick="filterByOverdue('${r.dept}', '${r.id}')">快速查看</button></td>
            </tr>
        `).join('');
    } else {
        warningCard.style.display = 'none';
    }
}

window.filterByOverdue = (dept, id) => {
    document.getElementById('filterDept').value = dept;
    document.getElementById('filterStatus').value = "審核中";
    window.applyFilters();
};

window.applyFilters = () => {
    const m = document.getElementById('filterMonth').value;
    const d = document.getElementById('filterDept').value;
    const s = document.getElementById('filterStatus').value;
    filteredRecords = allRecords.filter(r => {
        const sd = safeGet(r, ['sDate', 'startDate']);
        const matchMonth = m ? sd.startsWith(m) : true;
        const matchDept = d ? r.dept === d : true;
        const matchStatus = s ? r.status === s : true;
        return matchMonth && matchDept && matchStatus;
    });
    currentPage = 1; window.renderTable();
};

function getPhotoHtml(r) {
    let html = '';
    if (r.photo) html += `<img src="${r.photo}" class="table-thumb" onclick="window.openLightbox('${r.photo}')">`;
    if (r.photo2) html += `<img src="${r.photo2}" class="table-thumb" onclick="window.openLightbox('${r.photo2}')">`;
    if (r.photo3) html += `<img src="${r.photo3}" class="table-thumb" onclick="window.openLightbox('${r.photo3}')">`;
    return html || '<span style="color:#cbd5e1">-</span>';
}

window.renderTable = () => {
    const tbody = document.getElementById('allTableBody');
    const start = (currentPage - 1) * rowsPerPage;
    const paginated = filteredRecords.slice(start, start + rowsPerPage);
    if (paginated.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">目前無相符資料</td></tr>'; }
    else {
        tbody.innerHTML = paginated.map(r => {
            const statusClass = r.status === '批准' ? 'status-approved' : (r.status === '退件' ? 'status-rejected' : 'status-pending');
            const sd = safeGet(r, ['sDate', 'startDate']), ed = safeGet(r, ['eDate', 'endDate']);
            const dateRange = (sd === ed) ? sd : `${sd}~${ed}`;
            return `<tr>
                <td>${r.dept}</td><td>${r.id}</td><td>${r.name}</td><td>${r.leaveType}</td>
                <td style="font-size:12px;">${dateRange}</td>
                <td>${r.displayDuration || formatDuration(r.duration)}</td>
                <td>${getPhotoHtml(r)}</td>
                <td class="status-badge ${statusClass}">${r.status}</td>
                <td>
                    <button class="btn-action-s btn-edit-link" onclick="window.prepareEdit('${r.docId}', 'all')">修改</button>
                    <button class="btn-action-s btn-delete-link" onclick="window.deleteRecord('${r.docId}')">銷假</button>
                </td>
            </tr>`;
        }).join('');
    }
    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
    document.getElementById('pageInfo').innerText = `${currentPage} / ${totalPages}`;
};

window.exportMonthExcel = async () => {
    if (!isApprovalListAuth) { alert("請先輸入密碼載入清單資料後再執行匯出！"); return; }
    const exportMonth = document.getElementById('exportMonth').value;
    if (!exportMonth) return alert("請選擇要匯出的月份！");
    try {
        const q = query(collection(db, "formEntries"), where("status", "==", "批准"));
        const snap = await getDocs(q);
        let exportData = [["員工代號", "員工姓名", "假別", "出勤日期", "開始日期", "開始時間", "結束日期", "結束時間", "請假時數", "扣伙食費", "扣交通津貼", "事由", "備註(部門)", "批准時間"]];
        snap.docs.forEach(docSnap => {
            const r = docSnap.data();
            const sDate = safeGet(r, ['sDate', 'startDate']);
            if (!sDate || !sDate.startsWith(exportMonth)) return;
            let empId = String(r.id || "").trim();
            const firstChar = empId.charAt(0).toUpperCase(); 
            if (['F', 'X', 'H', 'G'].includes(firstChar)) { empId = firstChar.toLowerCase() + empId.slice(1); }
            const dMin = coreCalcMinutes(sDate, safeGet(r, ['sTime', 'startTime']), safeGet(r, ['eDate', 'endDate']), safeGet(r, ['eTime', 'endTime']));
            const formattedDuration = String(Math.floor(dMin / 60)).padStart(3, '0') + ':' + String(dMin % 60).padStart(2, '0');
            exportData.push([empId, r.name || "", r.leaveType || "", sDate, sDate, safeGet(r, ['sTime', 'startTime']), safeGet(r, ['eDate', 'endDate']), safeGet(r, ['eTime', 'endTime']), { t: 's', v: formattedDuration }, "", "", r.reason || "", r.dept || "", r.approveTime || ""]);
        });
        if (exportData.length <= 1) return alert(`該月份沒有已批准紀錄！`);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exportData), "請假紀錄");
        XLSX.writeFile(wb, `請假紀錄_${exportMonth}.xlsx`);
    } catch (e) { alert("匯出失敗：" + e.message); }
};

window.prepareEdit = async (docId, source = 'all') => {
    const record = (source === 'personal') ? personalRecords.find(r => r.docId === docId) : allRecords.find(r => r.docId === docId);
    if(!record) return;
    window.switchPage('dashboard');
    
    const empIdInput = document.getElementById('empId');
    const deptSelect = document.getElementById('dept');
    
    empIdInput.disabled = true; 
    deptSelect.disabled = true; 
    
    document.getElementById('editDocId').value = docId;
    empIdInput.value = record.id;
    document.getElementById('empName').value = record.name;
    deptSelect.value = record.dept;
    
    const leaveVal = reverseLeaveTranslations[record.leaveType] || record.leaveType;
    document.getElementById('leaveType').value = leaveVal;
    document.getElementById('reason').value = record.reason || "";
    window.setShift((record.sTime >= "07:00" && record.sTime <= "17:30") ? 'day' : 'middle');
    document.getElementById('startDate').value = safeGet(record, ['sDate', 'startDate']);
    document.getElementById('startTime').value = safeGet(record, ['sTime', 'startTime']);
    document.getElementById('endDate').value = safeGet(record, ['eDate', 'endDate']);
    document.getElementById('endTime').value = safeGet(record, ['eTime', 'endTime']);
    if(record.photo || record.photo2 || record.photo3) {
        document.getElementById('editPhotoPreview').style.display = 'block';
        document.getElementById('currentPhotosContainer').innerHTML = getPhotoHtml(record);
    }
    document.getElementById('submitBtn').innerText = "確認更新申請";
    document.getElementById('cancelEditBtn').style.display = 'block';
    window.autoCalc(); window.scrollTo(0,0);
};

window.deleteRecord = async (docId) => {
    if(!confirm("確定要銷假嗎？此動作無法復原。")) return;
    try {
        await deleteDoc(doc(db, "formEntries", docId));
        alert("已成功銷假");
        allRecords = allRecords.filter(r => r.docId !== docId);
        personalRecords = personalRecords.filter(r => r.docId !== docId);
        window.applyFilters();
        if (document.getElementById('page-personal').classList.contains('active')) window.renderPersonalTable();
    } catch (e) { alert("刪除失敗：" + e.message); }
};

window.resetForm = () => {
    document.getElementById('editDocId').value = ""; 
    document.getElementById('reason').value = "";
    document.getElementById('empId').disabled = false;
    document.getElementById('dept').disabled = false;
    document.getElementById('empName').value = "";
    document.getElementById('dept').value = "";
    document.getElementById('editPhotoPreview').style.display = 'none';
    document.getElementById('submitBtn').innerText = "確認送出申請";
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('leaveImg').value = "";
};

window.openLightbox = (src) => { document.getElementById('lightboxImg').src = src; document.getElementById('imageLightbox').style.display = 'flex'; };
window.closeLightbox = () => { document.getElementById('imageLightbox').style.display = 'none'; };

window.switchPage = (id) => {
    document.querySelectorAll('.page-content, .nav-item').forEach(el => el.classList.remove('active'));
    const page = document.getElementById('page-'+id), nav = document.getElementById('nav-'+id);
    if(page) page.classList.add('active'); if(nav) nav.classList.add('active');
    if(id === 'admin') window.loadAdminData();
    if(id === 'search') window.loadAllRecords();
};

window.checkAdminAccess = () => {
    const pw = prompt("請輸入主管管理密碼:");
    if (adminPasswords[pw]) { currentAdminDept = adminPasswords[pw]; window.switchPage('admin'); } 
    else if (pw !== null) alert("密碼錯誤！");
};

window.loadAdminData = async () => {
    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">讀取中...</td></tr>';
    try {
        const q = query(collection(db, "formEntries"), where("status", "==", "審核中"), limit(100));
        const snap = await getDocs(q);
        const filtered = snap.docs.map(d => ({ docId: d.id, ...d.data() }))
        .filter(r => {
            if (currentAdminDept === "總經理") { return gmTargetIds.includes(r.id.toUpperCase()); }
            if (currentAdminDept === "ALL") return true;
            return r.dept === currentAdminDept;
        })
        .sort((a, b) => {
            const timeA = a.updatedAt?.toMillis() || 0;
            const timeB = b.updatedAt?.toMillis() || 0;
            return timeB - timeA; 
        });
        currentPendingDocs = filtered; 
        adminCurrentPage = 1;
        document.getElementById('adminTitle').innerText = `🛡️ 審核中心 (${currentAdminDept})`;
        window.renderAdminTable();
    } catch (e) { tbody.innerHTML = `<tr><td colspan="6">錯誤: ${e.message}</td></tr>`; }
};

window.renderAdminTable = () => {
    const tbody = document.getElementById('adminTableBody');
    const bulkBtn = document.getElementById('bulkApproveBtn');
    const start = (adminCurrentPage - 1) * rowsPerPage;
    const paginated = currentPendingDocs.slice(start, start + rowsPerPage);
    if (currentPendingDocs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">目前無待審核資料</td></tr>';
        bulkBtn.style.display = "none";
        document.getElementById('adminPageInfo').innerText = "1 / 1";
        return;
    }
    bulkBtn.style.display = "inline-flex";
    bulkBtn.innerText = `✅ 一鍵批准 ${currentPendingDocs.length} 筆`;
    tbody.innerHTML = paginated.map(r => {
        const sd = safeGet(r, ['sDate', 'startDate']), st = safeGet(r, ['sTime', 'startTime']), ed = safeGet(r, ['eDate', 'endDate']);
        return `<tr>
            <td>${r.dept}</td><td><b>${r.name}</b><br>${r.leaveType}</td>
            <td>${sd} ${st}<br>~${ed}</td>
            <td>${r.displayDuration || formatDuration(r.duration)}</td>
            <td>${getPhotoHtml(r)}</td>
            <td>
                <button class="btn btn-success" style="padding:6px 15px;min-height:36px;" onclick="updateStatus('${r.docId}', '批准')">批准</button> 
                <button class="btn btn-danger" style="padding:6px 15px;min-height:36px;" onclick="updateStatus('${r.docId}', '退件')">退件</button>
            </td>
        </tr>`;
    }).join('');
    const totalPages = Math.ceil(currentPendingDocs.length / rowsPerPage) || 1;
    document.getElementById('adminPageInfo').innerText = `${adminCurrentPage} / ${totalPages}`;
};

window.updateStatus = async (docId, newStatus) => {
    if (!confirm(`確定要${newStatus}此假單？`)) return;
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    await updateDoc(doc(db, "formEntries", docId), { status: newStatus, approveTime: timeStr, updatedAt: serverTimestamp() });
    alert("處理成功"); window.loadAdminData(); 
    if (isApprovalListAuth) window.loadAllRecords(); 
};

window.bulkApprove = async () => {
    if (!currentPendingDocs.length || !confirm(`確定要一鍵批准這 ${currentPendingDocs.length} 筆申請嗎？`)) return;
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    for (const r of currentPendingDocs) {
        await updateDoc(doc(db, "formEntries", r.docId), { status: "批准", approveTime: timeStr, updatedAt: serverTimestamp() });
    }
    alert("批次處理完成！"); window.loadAdminData();
    if (isApprovalListAuth) window.loadAllRecords();
};

window.searchPersonalRecords = async () => {
    const rawQueryId = document.getElementById('queryEmpId').value.trim();
    if (!rawQueryId) return alert("請輸入工號！");
    const tbody = document.getElementById('personalTableBody'), resultArea = document.getElementById('personalResultArea');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">查詢中...</td></tr>';
    resultArea.style.display = 'block';
    try {
        const q1 = query(collection(db, "formEntries"), where("id", "==", rawQueryId)), q2 = query(collection(db, "formEntries"), where("id", "==", rawQueryId.toUpperCase()));
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const resultMap = new Map();
        [...snap1.docs, ...snap2.docs].forEach(d => resultMap.set(d.id, { docId: d.id, ...d.data() }));
        personalRecords = Array.from(resultMap.values()).sort((a, b) => (safeGet(b, ['sDate', 'startDate']) || "").localeCompare(safeGet(a, ['sDate', 'startDate']) || ""));
        window.renderPersonalTable();
    } catch (e) { tbody.innerHTML = `<tr><td colspan="9">查詢失敗：${e.message}</td></tr>`; }
};

window.renderPersonalTable = () => {
    const tbody = document.getElementById('personalTableBody');
    if (personalRecords.length === 0) { tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px;">查無紀錄</td></tr>`; return; }
    tbody.innerHTML = personalRecords.map(r => {
        const sd = safeGet(r, ['sDate', 'startDate']), ed = safeGet(r, ['eDate', 'endDate']), st = safeGet(r, ['sTime', 'startTime']), et = safeGet(r, ['eTime', 'endTime']);
        const statusClass = r.status === '批准' ? 'status-approved' : (r.status === '退件' ? 'status-rejected' : 'status-pending');
        return `<tr>
            <td>${r.dept || '-'}</td>
            <td style="font-weight:600;">${r.id || '-'}</td>
            <td>${r.name}</td>
            <td>${r.leaveType}</td>
            <td style="font-size:12px;">${(sd === ed) ? `${sd} ${st}~${et}` : `${sd} ${st} ~ ${ed} ${et}`}</td>
            <td style="font-weight:bold; color:var(--primary);">${r.displayDuration || formatDuration(r.duration)}</td>
            <td>${getPhotoHtml(r)}</td>
            <td class="status-badge ${statusClass}">${r.status}</td>
            <td>
                <button class="btn-action-s btn-edit-link" onclick="window.prepareEdit('${r.docId}', 'personal')">修改</button>
                <button class="btn-action-s btn-delete-link" onclick="window.deleteRecord('${r.docId}')">銷假</button>
            </td>
        </tr>`;
    }).join('');
};

function coreCalcMinutes(d1, t1, d2, t2) {
    if(!d1 || !t1 || !d2 || !t2) return 0;
    let startDT = new Date(`${d1}T${t1}`), endDT = new Date(`${d2}T${t2}`);
    if (endDT <= startDT) return 0;
    const isDayShift = (t1 >= "07:00" && t1 <= "17:30");
    const sWorkTime = isDayShift ? "08:30" : "18:00", eWorkTime = isDayShift ? "17:30" : "02:30";
    const breakStartStr = isDayShift ? "12:00" : "00:00", breakEndStr = isDayShift ? "13:00" : "00:30";
    let totalMinutes = 0, iterDate = new Date(d1), lastDate = new Date(d2);
    while (iterDate <= lastDate) {
        let dayOfWeek = iterDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            let dayStr = iterDate.toISOString().split('T')[0], shiftStart = new Date(`${dayStr}T${sWorkTime}`), shiftEnd = new Date(`${dayStr}T${eWorkTime}`);
            if (!isDayShift) shiftEnd.setDate(shiftEnd.getDate() + 1);
            let actualStart = new Date(Math.max(startDT, shiftStart)), actualEnd = new Date(Math.min(endDT, shiftEnd));
            if (actualStart < actualEnd) {
                let diffMins = (actualEnd - actualStart) / (1000 * 60);
                let bS = new Date(`${dayStr}T${breakStartStr}`), bE = new Date(`${dayStr}T${breakEndStr}`);
                if (!isDayShift) { bS.setDate(bS.getDate() + 1); bE.setDate(bE.getDate() + 1); }
                let intersectStart = new Date(Math.max(actualStart, bS)), intersectEnd = new Date(Math.min(actualEnd, bE));
                if (intersectStart < intersectEnd) diffMins -= (intersectEnd - intersectStart) / (1000 * 60);
                totalMinutes += diffMins;
            }
        }
        iterDate.setDate(iterDate.getDate() + 1);
    }
    return Math.max(0, Math.round(totalMinutes));
}

window.autoCalc = () => {
    const min = coreCalcMinutes(document.getElementById('startDate').value, document.getElementById('startTime').value, document.getElementById('endDate').value, document.getElementById('endTime').value);
    const display = formatDuration(min);
    document.getElementById('durationText').innerText = `🕒 計算結果：${display}`;
    return { displayStr: display, totalMinutes: min };
};

window.setShift = (s) => {
    document.getElementById('hasSelectedShift').value = "true";
    document.querySelectorAll('input[type="date"], input[type="time"]').forEach(el => el.disabled = false);
    document.getElementById('shiftDayBtn').classList.toggle('shift-active', s === 'day');
    document.getElementById('shiftMidBtn').classList.toggle('shift-active', s === 'middle');
    const sd = document.getElementById('startDate').value;
    if(s === 'day'){ 
        document.getElementById('startTime').value="08:30"; document.getElementById('endTime').value="17:30"; 
        if(sd) document.getElementById('endDate').value = sd; 
    } else { 
        document.getElementById('startTime').value="18:00"; document.getElementById('endTime').value="02:30"; 
        if(sd) { let d = new Date(sd); d.setDate(d.getDate() + 1); document.getElementById('endDate').value = d.toISOString().split('T')[0]; } 
    }
    window.autoCalc();
};

const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const maxWidth = 1024;
                if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
    });
};

window.saveToCloud = async () => {
    if(document.getElementById('hasSelectedShift').value !== "true") return alert("請先點選班別！");
    const empId = document.getElementById('empId').value.trim();
    const empNameVal = document.getElementById('empName').value.trim();
    const deptVal = document.getElementById('dept').value;

    const sDateVal = document.getElementById('startDate').value;
    const sTimeVal = document.getElementById('startTime').value;
    const eDateVal = document.getElementById('endDate').value;
    const eTimeVal = document.getElementById('endTime').value;

    if (!empId) return alert("請輸入工號！");
    if (!empNameVal || empNameVal === "查無此人" || empNameVal === "輸入中..." || empNameVal === "查詢中..." || empNameVal === "系統錯誤") {
        return alert("❌ 無法送出：查無此人或尚未確認正確的員工姓名與部門！請重新確認工號。");
    }
    if (!deptVal) {
        return alert("❌ 無法送出：請選擇所屬部門！");
    }

    if (!sDateVal || !sTimeVal || !eDateVal || !eTimeVal) {
        return alert("❌ 無法送出：請填寫完整的起始與結束日期及時間！");
    }

    const rawLeaveType = document.getElementById('leaveType').value;
    const leaveType = reverseLeaveTranslations[rawLeaveType] || rawLeaveType;
    const photoFiles = document.getElementById('leaveImg').files;
    
    const isEdit = !!document.getElementById('editDocId').value;
    const hasExistingPhoto = document.getElementById('currentPhotosContainer').innerHTML.includes('img');

    const calcResult = window.autoCalc();
    if (leaveType === "特休" && calcResult.totalMinutes < 60) {
        return alert("❌ 請特休需要至少一小時，否則無法送出申請。");
    }

    if ((leaveType === "病假" || leaveType === "家庭照顧假") && photoFiles.length === 0 && !hasExistingPhoto) {
         return alert("申請「病假」或「家庭照顧假」必須上傳證明文件照片！");
    }

    const btn = document.getElementById('submitBtn'); 
    btn.disabled = true; btn.innerText = "正在壓縮圖片並處理中...";

    try {
        const entryData = { 
            id: empId, name: empNameVal, dept: deptVal, 
            leaveType: leaveType, sDate: sDateVal, sTime: sTimeVal, 
            eDate: eDateVal, eTime: eTimeVal, 
            reason: document.getElementById('reason').value, duration: calcResult.totalMinutes, 
            displayDuration: calcResult.displayStr, updatedAt: serverTimestamp() 
        };
        if (photoFiles.length > 0) {
            if (photoFiles[0]) entryData.photo = await compressImage(photoFiles[0]);
            if (photoFiles[1]) entryData.photo2 = await compressImage(photoFiles[1]);
            if (photoFiles[2]) entryData.photo3 = await compressImage(photoFiles[2]);
        }
        if (isEdit) {
            entryData.status = "審核中";
            await updateDoc(doc(db, "formEntries", document.getElementById('editDocId').value), entryData);
        } else {
            entryData.status = "審核中"; entryData.createdAt = serverTimestamp();
            await addDoc(collection(db, "formEntries"), entryData);
            sendEmailNotification(entryData);
        }
        alert("操作成功！"); window.resetForm();
        if (isApprovalListAuth) window.loadAllRecords();
        if (document.getElementById('page-personal').classList.contains('active')) window.searchPersonalRecords();
        if (document.getElementById('page-admin').classList.contains('active')) window.loadAdminData();
    } catch (e) { alert("失敗：" + e.message); } finally { btn.disabled = false; btn.innerText = "確認送出申請"; }
};
