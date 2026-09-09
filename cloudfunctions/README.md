# 云函数目录

MVP 骨架阶段为空占位。按下一步开发顺序，将陆续添加：

- `login`：wx.login 换取 openid，用户建档（users 集合，含角色字段）
- `relationship`：家属-老人监护关系（邀请码绑定 + 老人确认）
- `device`：设备/机器人绑定与状态（devices 集合）
- `health`：健康数据写入与查询（Mock 上报 + health_observations 集合）
- `alert`：SOS/阈值预警创建、状态流转（open → acknowledged → resolved）、通知家属
- `appointment`：社区医护 / 志愿者陪伴 / 医疗机构复诊三类预约
- `report`：AI 健康报告生成（聚合数据 → 大模型，含“AI 生成”标识与免责声明）
