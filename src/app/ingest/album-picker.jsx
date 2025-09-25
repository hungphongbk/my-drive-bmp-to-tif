
import { useState } from 'react';
import useSWR from 'swr';

const fetcher = (...args) => fetch(...args).then(res => res.json());

export default function AlbumPicker({ value, onChange }) {
	const { data, error, isLoading } = useSWR('/api/lightroom/albums', fetcher, { revalidateOnFocus: false });
	const [selected, setSelected] = useState(value || '');

	if (isLoading) return <div>Đang tải danh sách album...</div>;
	if (error) return <div>Lỗi khi tải album: {error.message || 'Unknown error'}</div>;
	if (!data || !data.albums) return <div>Không có album nào.</div>;

	const handleChange = (e) => {
		setSelected(e.target.value);
		if (onChange) onChange(e.target.value);
	};

	return (
		<div className="flex flex-col gap-2">
			<label className="font-medium text-sm">Chọn album Lightroom:</label>
			<select
				className="border rounded px-3 py-2 bg-white text-black"
				value={selected}
				onChange={handleChange}
			>
				<option value="">-- Chọn album --</option>
				{data.albums.map(album => (
					<option key={album.id} value={album.id}>{album.name}</option>
				))}
			</select>
		</div>
	);
}
